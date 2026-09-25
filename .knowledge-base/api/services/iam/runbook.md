# IAM Service Runbook

## Common Operations

### Check User Login Status

**Scenario:** User reports they cannot log in

**Steps:**
1. Check if user exists in database:
   ```sql
   SELECT id, email, is_active, is_locked, locked_until, failed_login_attempts
   FROM users
   WHERE email = 'user@example.com';
   ```

2. Check account status:
   - `is_active = false` → Account deactivated
   - `is_locked = true` → Account locked due to failed attempts
   - `locked_until` → Check if lock has expired

3. Check failed login attempts:
   ```bash
   redis-cli GET "ratelimit:login:<ip_address>"
   ```

4. Check if session exists:
   ```bash
   redis-cli KEYS "session:*" | xargs -I {} redis-cli GET {}
   ```

**Resolution:**
- Unlock account: `UPDATE users SET is_locked = false, locked_until = NULL WHERE id = '<user_id>';`
- Reset failed attempts: `UPDATE users SET failed_login_attempts = 0 WHERE id = '<user_id>';`
- Clear rate limit: `redis-cli DEL "ratelimit:login:<ip_address>"`

---

### Unlock User Account

**Scenario:** User account locked after too many failed login attempts

**Steps:**
1. Verify user identity through alternative channel
2. Unlock account in database:
   ```sql
   UPDATE users
   SET is_locked = false,
       locked_until = NULL,
       failed_login_attempts = 0
   WHERE email = 'user@example.com';
   ```

3. Clear lockout record in Redis:
   ```bash
   redis-cli DEL "lockout:<user_id>"
   ```

4. Notify user via email that account has been unlocked

**Prevention:**
- Educate user about password requirements
- Suggest password manager
- Enable MFA for additional security

---

### Force Password Reset

**Scenario:** Security incident requires password reset

**Steps:**
1. Invalidate all user sessions:
   ```bash
   # Find all sessions for user
   redis-cli KEYS "session:*" | while read key; do
     session=$(redis-cli GET "$key")
     if echo "$session" | grep -q "<user_id>"; then
       redis-cli DEL "$key"
     fi
   done
   ```

2. Mark password as expired (if field exists):
   ```sql
   UPDATE users
   SET password_expired = true
   WHERE id = '<user_id>';
   ```

3. Send password reset email:
   ```typescript
   await emailService.sendPasswordReset({
     to: user.email,
     reason: 'security_incident'
   });
   ```

---

### Clear All Sessions for User

**Scenario:** User reports suspicious activity or requests logout from all devices

**Steps:**
1. Find all sessions for user:
   ```bash
   redis-cli KEYS "session:*" | while read key; do
     session=$(redis-cli GET "$key")
     if echo "$session" | grep -q "<user_id>"; then
       echo "$key"
       redis-cli DEL "$key"
     fi
   done
   ```

2. Verify sessions cleared:
   ```bash
   redis-cli KEYS "session:*" | while read key; do
     redis-cli GET "$key" | grep "<user_id>" && echo "Session still exists: $key"
   done
   ```

3. Notify user via email

---

### Investigate Failed Login Attempts

**Scenario:** Suspicious login activity detected

**Steps:**
1. Query audit logs:
   ```sql
   SELECT *
   FROM audit_logs
   WHERE type = 'authentication'
     AND action = 'login_failed'
     AND user_id = '<user_id>'
   ORDER BY created_at DESC
   LIMIT 50;
   ```

2. Check for patterns:
   - Multiple IPs → Possible credential stuffing
   - Same IP, different users → Possible brute force
   - Unusual times → Possible unauthorized access

3. Check rate limit status:
   ```bash
   redis-cli GET "ratelimit:login:<ip_address>"
   ```

4. If attack detected:
   - Block IP at firewall/load balancer level
   - Increase rate limits temporarily
   - Notify security team
   - Contact user if their account targeted

---

## Troubleshooting

### Users Cannot Log In (Service-Wide)

**Symptoms:**
- All users report login failures
- 500 errors on login endpoint

**Diagnosis:**
1. Check database connectivity:
   ```bash
   psql $DATABASE_URL -c "SELECT 1;"
   ```

2. Check Redis connectivity:
   ```bash
   redis-cli -u $REDIS_URL ping
   ```

3. Check application logs:
   ```bash
   tail -f /var/log/api/error.log | grep "auth"
   ```

4. Check service health endpoint:
   ```bash
   curl https://secondchancepuzzles.com/api/health
   ```

**Resolution:**
- Database down → Restart database service
- Redis down → Restart Redis service
- Application error → Check logs, restart application
- Network issue → Check network connectivity

---

### Sessions Expiring Too Quickly

**Symptoms:**
- Users logged out unexpectedly
- Session validation fails

**Diagnosis:**
1. Check session TTL in Redis:
   ```bash
   redis-cli TTL "session:<session_id>"
   ```

2. Check session configuration:
   ```bash
   echo $SESSION_EXPIRY_DAYS
   ```

3. Check for Redis memory issues:
   ```bash
   redis-cli INFO memory
   ```

**Resolution:**
- Incorrect TTL → Update SESSION_EXPIRY_DAYS env var
- Redis evicting keys → Increase Redis memory or adjust eviction policy
- Clock skew → Sync server clocks with NTP

---

### Password Reset Emails Not Sending

**Symptoms:**
- Users not receiving reset emails
- Email service errors in logs

**Diagnosis:**
1. Check email service health:
   ```bash
   curl http://localhost:1025 # Mailpit
   ```

2. Check email logs:
   ```bash
   tail -f /var/log/api/email.log
   ```

3. Test email sending manually:
   ```typescript
   await emailService.sendTest('test@example.com');
   ```

**Resolution:**
- Mailpit down → Restart Mailpit
- SMTP configuration → Check SMTP_* env vars
- Email queue backed up → Clear queue, restart service

---

### High Rate of Failed Login Attempts

**Symptoms:**
- Many users locked out
- High rate limit hits
- Potential brute force attack

**Diagnosis:**
1. Check failed login rate:
   ```sql
   SELECT COUNT(*), ip_address
   FROM audit_logs
   WHERE action = 'login_failed'
     AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY ip_address
   ORDER BY COUNT(*) DESC;
   ```

2. Check for patterns:
   ```bash
   redis-cli KEYS "ratelimit:login:*" | wc -l
   ```

**Resolution:**
1. Block attacking IPs:
   ```bash
   # At firewall level
   iptables -A INPUT -s <ip_address> -j DROP
   ```

2. Temporarily increase rate limits:
   ```bash
   # Update configuration
   export LOGIN_RATE_LIMIT=10
   ```

3. Enable CAPTCHA for login (if available)

4. Notify security team

5. Monitor for continued attacks

---

## Monitoring

### Key Metrics to Monitor

**Authentication Metrics:**
- Login success rate (target: >95%)
- Login failure rate (alert if >10%)
- Average login time (target: <500ms)
- Password reset request rate

**Session Metrics:**
- Active sessions count
- Session creation rate
- Session validation latency (target: <50ms)
- Session expiration rate

**Security Metrics:**
- Failed login attempts per IP
- Account lockout rate
- Rate limit hits
- Suspicious login patterns

### Alerts

**Critical Alerts:**
- Database connection failure
- Redis connection failure
- Login endpoint down (5xx errors >5%)
- Authentication success rate <80%

**Warning Alerts:**
- High failed login rate (>20% of attempts)
- Unusual password reset volume (>100/hour)
- Session validation latency >200ms
- Redis memory usage >80%

### Health Check Endpoint

```bash
curl https://secondchancepuzzles.com/api/health/auth
```

Expected response:
```json
{
  "status": "healthy",
  "checks": {
    "database": "healthy",
    "redis": "healthy",
    "email": "healthy"
  },
  "metrics": {
    "activeSessions": 1234,
    "loginSuccessRate": 0.98
  }
}
```

---

## Maintenance

### Session Cleanup

**Frequency:** Daily

**Steps:**
1. Redis automatically expires sessions based on TTL
2. Verify no orphaned sessions:
   ```bash
   redis-cli KEYS "session:*" | wc -l
   ```
3. If too many sessions, check for TTL issues

### Database Maintenance

**Frequency:** Weekly

**Steps:**
1. Vacuum users table:
   ```sql
   VACUUM ANALYZE users;
   ```

2. Check for locked accounts:
   ```sql
   SELECT COUNT(*)
   FROM users
   WHERE is_locked = true
     AND locked_until < NOW();
   ```

3. Auto-unlock expired locks:
   ```sql
   UPDATE users
   SET is_locked = false,
       locked_until = NULL
   WHERE is_locked = true
     AND locked_until < NOW();
   ```

### Log Rotation

**Frequency:** Daily

**Steps:**
1. Rotate application logs
2. Archive old logs to S3/backup
3. Keep last 30 days locally

---

## Disaster Recovery

### Database Failure

1. Check database status
2. Attempt restart
3. If unrecoverable, restore from backup
4. Replay WAL logs to minimize data loss
5. Update connection strings if failover

### Redis Failure

1. Check Redis status
2. Attempt restart
3. If unrecoverable:
   - All sessions lost (users must re-login)
   - Rate limits reset
   - No data loss (sessions are ephemeral)

### Complete Service Outage

1. Check all dependencies (DB, Redis, Email)
2. Restart services in order: DB → Redis → Application
3. Verify health checks pass
4. Monitor error rates
5. Communicate with users about outage

---

## Related Documentation

- [Overview](./overview.md)
- [API Documentation](./api-doc.md)
- [Dependencies](./dependencies.md)
- [Context](./context.md)

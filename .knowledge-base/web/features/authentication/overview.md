# Authentication Feature

## Purpose

Provides user authentication flows including login, signup, password reset, and multi-factor authentication integration.

## User Flows

### Login Flow
1. User navigates to `/login`
2. Enters email and password
3. Submits form (works without JS via form action)
4. Server validates credentials via API
5. If MFA enabled, redirect to MFA verification
6. If successful, redirect to dashboard
7. Session cookie set for future requests

### Signup Flow
1. User navigates to `/signup`
2. Enters email, name, and password
3. Client-side validation (optional enhancement)
4. Submits form to server action
5. Server creates account via API
6. Verification email sent (if enabled)
7. Auto-login or redirect to login

### Password Reset Flow
1. User clicks "Forgot password" on login
2. Enters email address
3. Server sends reset email (if account exists)
4. User clicks link in email
5. Enters new password
6. Server validates token and updates password
7. Redirect to login with success message

### MFA Verification Flow
1. After successful password login
2. If MFA enabled, redirect to `/mfa/verify`
3. User enters TOTP code or uses passkey
4. Server validates MFA code
5. If successful, complete login
6. Redirect to dashboard

## Routes

### `/login` - Login Page
- **Layout**: `(auth)` - Centered auth layout
- **Load**: Check if already authenticated, redirect if so
- **Actions**: `default` - Process login form
- **Components**: LoginForm, SocialLogin (if enabled)

### `/signup` - Signup Page
- **Layout**: `(auth)`
- **Load**: Check if already authenticated
- **Actions**: `default` - Process signup form
- **Components**: SignupForm, PasswordStrength

### `/reset-password` - Password Reset Request
- **Layout**: `(auth)`
- **Actions**: `default` - Send reset email
- **Components**: ResetRequestForm

### `/reset-password/[token]` - Password Reset Confirmation
- **Layout**: `(auth)`
- **Load**: Validate reset token
- **Actions**: `default` - Update password
- **Components**: ResetPasswordForm

### `/mfa/verify` - MFA Verification
- **Layout**: `(auth)`
- **Load**: Check temp auth token
- **Actions**: `verify` - Validate MFA code
- **Components**: MfaCodeInput, PasskeyButton

## Components

### LoginForm
```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';

  let loading = $state(false);
</script>

<form method="POST" use:enhance>
  <Input name="email" type="email" required />
  <Input name="password" type="password" required />
  <Button type="submit" disabled={loading}>Login</Button>
</form>
```

### SignupForm
- Email input with validation
- Name input
- Password input with strength indicator
- Terms acceptance checkbox
- Submit button with loading state

### PasswordStrength
- Visual indicator of password strength
- Requirements checklist
- Real-time validation

## State Management

### Local State
- Form loading states
- Validation errors
- Password visibility toggles

### Server State
- User session (from load function)
- Form action results
- MFA requirement status

## API Integration

### Login Endpoint
```typescript
POST /api/auth/login
Body: { email, password }
Response: { user, requiresMfa }
```

### Signup Endpoint
```typescript
POST /api/auth/signup
Body: { email, name, password }
Response: { user }
```

### Password Reset Request
```typescript
POST /api/auth/password/reset-request
Body: { email }
Response: { success: true }
```

### Password Reset Confirm
```typescript
POST /api/auth/password/reset
Body: { token, newPassword }
Response: { success: true }
```

## Security Considerations

- CSRF protection via SvelteKit
- Password strength validation
- Rate limiting on API endpoints
- Secure session cookies
- Email verification (optional)
- MFA support

## Error Handling

### Form Errors
- Display field-specific errors
- Show general error messages
- Maintain form state on error

### API Errors
- Handle network failures
- Show user-friendly messages
- Log errors for debugging

## Accessibility

- Semantic form elements
- Proper label associations
- Error announcements for screen readers
- Keyboard navigation support
- Focus management

## Related Documentation

- [Web Coding Standards](../../standards/coding-standards.md)

# Users Service

## Purpose

Manages user profiles, preferences, and account information beyond authentication. Handles user CRUD operations, profile updates, and user-related queries.

## Responsibilities

- User profile management (name, email, avatar)
- User preferences and settings
- User search and listing (admin)
- Account deactivation/deletion
- User statistics and activity

## Core Features

- Get user profile by ID
- Update user profile
- List users (admin, with pagination/filtering)
- Search users by name/email
- Deactivate/reactivate accounts
- Delete user accounts (GDPR compliance)

## Integration Points

- **IAM Service**: Current user profile (`/me`)
- **Donations Service**: User donation history
- **Requests Service**: User puzzle requests
- **Storage Service**: Avatar uploads

## Related Documentation

- [API Index](../../index.md)

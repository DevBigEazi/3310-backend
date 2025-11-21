# Authentication Scripts

## Generate JWT Token

This script generates a JWT token for testing purposes to protect your API endpoints, similar to the Hono approach.

### Usage

1. Build the project first:
```bash
npm run build
```

2. Run the script:
```bash
node dist/scripts/generateToken.js
```

3. Copy the generated token and use it in your API requests:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Customizing Tokens

To generate tokens with different payloads, edit the `src/scripts/generateToken.ts` file:

```typescript
// Customize the payload
const payload = {
  clientId: 'play3310',
  permissions: ['read', 'write']
};

// Optional: Set token options
const options = {
  // No expiration by default
  // Uncomment the next line if you want to set expiration
  // expiresIn: '1h' // Token expires in 1 hour
};
```

Then rebuild and run the script again.

## JWT Secret

The JWT secret is defined in `src/middleware/auth.ts`. In production, you should set the `JWT_SECRET` environment variable to a secure value.

## Accessing JWT Payload in Routes

In your route handlers, you can access the JWT payload like this:

```typescript
router.get('/protected-route', jwtAuth, (req: AuthRequest, res: Response) => {
  // Access the JWT payload - similar to c.get('jwtPayload') in Hono
  const payload = req.jwtPayload;
  
  // Use payload data
  console.log(payload.clientId, payload.permissions);
  
  // Rest of your route handler
});
```

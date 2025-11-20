import { generateToken } from '../middleware/auth.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Calculate the project root directory (2 levels up from scripts folder)
const rootDir = path.resolve(__dirname, '../..');

// Load environment variables from .env file with explicit path
dotenv.config({ path: path.join(rootDir, '.env') });

// Debug output
console.log(`Looking for .env file at: ${path.join(rootDir, '.env')}`);


// Check if JWT_SECRET is available
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET environment variable is not set in .env file');
  console.error('Please create a .env file based on .env.example and set JWT_SECRET');
  process.exit(1);
}

// Generate a token for testing purposes with a custom payload
const payload = {
  // You can include any data you want in the payload
  clientId: 'play3310',
  permissions: ['read', 'write']
};

// Optional: Set token options (similar to how you would in other systems)
const options = {
  // No expiration by default - similar to Hono example
  // Uncomment the next line if you want to set expiration
  // expiresIn: '1h' // Token expires in 1 hour
};

const token = generateToken(payload, options);
console.log('Generated JWT token:');
console.log(token);
console.log('\nUse this token in your Authorization header:');
console.log(`Authorization: Bearer ${token}`);
console.log('\nDecoded payload:');
console.log(JSON.stringify(payload, null, 2));

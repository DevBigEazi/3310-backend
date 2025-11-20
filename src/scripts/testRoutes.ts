import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateToken } from '../middleware/auth.js';

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Calculate the project root directory (2 levels up from scripts folder)
const rootDir = path.resolve(__dirname, '../..');

// Load environment variables from .env file with explicit path
dotenv.config({ path: path.join(rootDir, '.env') });

// Base URL for API
const API_URL = `http://localhost:${process.env.PORT || 8500}`;

// Generate a test token
const generateTestToken = () => {
  const payload = {
    clientId: 'test-client',
    permissions: ['read', 'write'],
  };
  
  return generateToken(payload);
};

// Test a route with authentication
const testAuthenticatedRoute = async (route: string) => {
  try {
    const token = generateTestToken();
    console.log(`Testing route: ${route}`);
    console.log(`Using token: ${token}`);
    
    const response = await axios.get(`${API_URL}${route}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    return response;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error('Error status:', error.response?.status);
      console.error('Error data:', error.response?.data);
    } else {
      console.error('Error:', error);
    }
    throw error;
  }
};

// Test routes
const testRoutes = async () => {
  try {
    // Test health check (no auth required)
    console.log('\n--- Testing health check ---');
    const healthResponse = await axios.get(`${API_URL}/health`);
    console.log('Health check status:', healthResponse.status);
    console.log('Health check data:', healthResponse.data);
    
    // Test protected routes - add your routes here
    console.log('\n--- Testing player routes ---');
    await testAuthenticatedRoute('/api/player/0x123456789abcdef123456789abcdef123456789a');
    
    // Add more route tests as needed
    // await testAuthenticatedRoute('/api/admin/stats');
    
  } catch (error: unknown) {
    console.error('Test failed:', error instanceof Error ? error.message : String(error));
  }
};

// Run the tests
testRoutes();

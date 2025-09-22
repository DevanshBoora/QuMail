const { QKDClient } = require('../qkd_client/qkd_client');
const { EncryptionEngine } = require('../encryption/encryption_engine');
const { DemoEmailService } = require('../email/demo_email_service');

class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  async runAllTests() {
    console.log('?? Starting QuMail Test Suite...\n');
    
    await this.testQKDClient();
    await this.testEncryptionEngine();
    await this.testDemoEmailService();
    
    this.printResults();
  }

  async testQKDClient() {
    console.log('?? Testing QKD Client...');
    
    const client = new QKDClient();
    
    // Test key generation
    try {
      const key = await client.getQuantumKey();
      this.assert(key.keyId, 'QKD Client should generate key ID');
      this.assert(key.key, 'QKD Client should generate key data');
      this.assert(key.keySize === 256, 'Key size should be 256 bits');
      console.log('  ? Key generation test passed');
    } catch (error) {
      console.log('  ? Key generation test failed:', error.message);
      this.failed++;
    }
  }

  async testEncryptionEngine() {
    console.log('?? Testing Encryption Engine...');
    
    const engine = new EncryptionEngine();
    const testData = 'Hello, QuMail! This is a test message.';
    const testKey = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    
    // Test all encryption algorithms
    const algorithms = ['plain', 'aes256', 'otp', 'kyber'];
    
    for (const algorithm of algorithms) {
      try {
        const encrypted = await engine.encrypt(testData, testKey, algorithm);
        const decrypted = await engine.decrypt(encrypted, testKey, algorithm);
        
        this.assert(decrypted === testData, `${algorithm} encryption/decryption should work`);
        console.log(`  ? ${algorithm.toUpperCase()} encryption test passed`);
      } catch (error) {
        console.log(`  ? ${algorithm.toUpperCase()} encryption test failed:`, error.message);
        this.failed++;
      }
    }
  }

  async testDemoEmailService() {
    console.log('?? Testing Demo Email Service...');
    
    const service = new DemoEmailService();
    
    // Test authentication
    try {
      const authResult = await service.authenticate();
      this.assert(authResult.success, 'Demo authentication should succeed');
      this.assert(service.isAuthenticated(), 'Service should be authenticated');
      console.log('  ? Authentication test passed');
    } catch (error) {
      console.log('  ? Authentication test failed:', error.message);
      this.failed++;
    }
    
    // Test email fetching
    try {
      const emails = await service.fetchEmails();
      this.assert(Array.isArray(emails), 'Should return array of emails');
      this.assert(emails.length > 0, 'Should have demo emails');
      console.log('  ? Email fetching test passed');
    } catch (error) {
      console.log('  ? Email fetching test failed:', error.message);
      this.failed++;
    }
    
    // Test email sending
    try {
      const emailData = {
        to: 'test@example.com',
        subject: 'Test Email',
        body: 'This is a test email from QuMail.',
        encrypted: true,
        encryptionLevel: 'aes256'
      };
      
      const result = await service.sendEmail(emailData);
      this.assert(result.success, 'Email sending should succeed');
      this.assert(result.messageId, 'Should return message ID');
      console.log('  ? Email sending test passed');
    } catch (error) {
      console.log('  ? Email sending test failed:', error.message);
      this.failed++;
    }
  }

  assert(condition, message) {
    if (condition) {
      this.passed++;
    } else {
      this.failed++;
      throw new Error(message);
    }
  }

  printResults() {
    console.log('\n?? Test Results:');
    console.log(`? Passed: ${this.passed}`);
    console.log(`? Failed: ${this.failed}`);
    console.log(`?? Success Rate: ${((this.passed / (this.passed + this.failed)) * 100).toFixed(1)}%`);
    
    if (this.failed === 0) {
      console.log('\n?? All tests passed! QuMail is ready for deployment.');
    } else {
      console.log('\n??  Some tests failed. Please check the implementation.');
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const runner = new TestRunner();
  runner.runAllTests().catch(console.error);
}

module.exports = { TestRunner };

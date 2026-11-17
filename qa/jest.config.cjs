const path = require('path');

const repo = path.resolve(__dirname, '..');
const sut = path.resolve(process.env.KYS_QA_SUT_ROOT || repo);

module.exports = {
  rootDir: repo,
  preset: '@react-native/jest-preset',
  transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
  testMatch: ['<rootDir>/qa/adapters/*.probe.jsx'],
  moduleNameMapper: { '^@sut/(.*)$': path.join(sut, 'src', '$1') },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native[^/]*|@react-native(-community)?|@react-navigation|use-latest-callback|nanoid)/)',
  ],
  testTimeout: 15000,
};

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@actions/cache$': '<rootDir>/src/__tests__/mocks/actions-cache.ts',
    '^@actions/core$': '<rootDir>/src/__tests__/mocks/actions-core.ts',
    '^@actions/exec$': '<rootDir>/src/__tests__/mocks/actions-exec.ts',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/__tests__/**',
    '!src/main.ts',
    '!src/post.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};

// Phase 1 tests cover pure TypeScript logic only (no React Native runtime),
// so we use the lightweight ts-jest preset on a node environment. When we add
// component tests later, reintroduce jest-expo with version-aligned jest.
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/src/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
};

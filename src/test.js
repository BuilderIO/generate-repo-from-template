#!/usr/bin/env node

const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { utils, getExampleFolders } = require('./index.js');

const MY_API_KEY = 'ad30f9a246614faaa6a03374f83554c9';

// Extend the base log with test-specific styling
const log = {
  ...utils.log,
  info: (...args) => console.log(chalk.blue('ℹ'), ...args),
  title: (...args) => console.log(chalk.bold('\n🧪', ...args)),
};

async function getAllTemplates() {
  const examples = await getExampleFolders();
  
  if (!examples || examples.length === 0) {
    log.error('No templates found in the examples directory');
    process.exit(1);
  }

  return examples;
}

async function testTemplate(template) {
  log.info(`\nTesting template: ${chalk.cyan(template)}`);
  
  const testDir = path.join(process.cwd(), 'test-results', template);
  const results = {
    template,
    setup: false,
    errors: [],
    ...utils.categorizeTemplate(template),
    url: utils.getTemplateUrl(template)
  };

  try {
    await fs.remove(testDir);
    await fs.ensureDir(testDir);

    const { generateTemplate } = require('./index.js');
    await generateTemplate({
      directory: testDir,
      template,
      apiKey: MY_API_KEY,
      version: 'latest',
      silent: true
    });
    results.setup = true;

    return results;
  } catch (error) {
    results.errors.push(`Test failed: ${error.message}`);
    return results;
  }
}

async function runTests() {
  log.title('Running Template Tests');
  const templates = await getAllTemplates();

  if (templates.length === 0) {
    log.error('No templates found in the examples directory');
    process.exit(1);
  }

  const results = [];
  for (const template of templates) {
    const result = await testTemplate(template);
    results.push(result);
  }

  log.title('Test Results');
  
  let passedCount = 0;
  let failedCount = 0;

  results.forEach(result => {
    const passed = result.setup && result.errors.length === 0;
    if (passed) {
      passedCount++;
      log.success(`${result.template} (${result.framework} - ${result.generation})`);
      console.log(chalk.gray(`  URL: ${result.url}`));
      console.log(chalk.green('  Status: Template downloaded successfully'));
    } else {
      failedCount++;
      log.error(`${result.template} (${result.framework} - ${result.generation})`);
      console.log(chalk.gray(`  URL: ${result.url}`));
      console.log(chalk.gray('  Status:'));
      console.log(chalk.gray(`    Setup: ${result.setup ? '✓' : '✗'}`));
      if (result.errors.length > 0) {
        console.log(chalk.gray('  Errors:'));
        result.errors.forEach(error => {
          console.log(chalk.gray(`    - ${error}`));
        });
      }
    }
  });

  console.log('\nSummary:');
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${chalk.green(passedCount)}`);
  console.log(`Failed: ${chalk.red(failedCount)}`);

  // Exit with appropriate code
  process.exit(failedCount > 0 ? 1 : 0);
}

runTests().catch(error => {
  log.error('Test runner failed:', error.message);
  process.exit(1);
}); 
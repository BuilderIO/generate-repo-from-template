#!/usr/bin/env node

const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { utils, getExampleFolders, generateTemplate } = require('./index.js');

const MY_API_KEY = 'ad30f9a246614faaa6a03374f83554c9';
const TEST_DIR = 'test-results';

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

async function createTestProject(framework, gen, template) {
  const projectName = `${framework.toLowerCase().replace('.', '')}-${gen.toLowerCase()}-${template}`;
  const projectDir = path.join(process.cwd(), TEST_DIR, projectName);

  try {
    await generateTemplate({
      directory: projectDir,
      template,
      apiKey: MY_API_KEY,
      silent: true
    });
    return { success: true, path: projectDir };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testPromptChoices() {
  const examples = await getAllTemplates();
  const results = {
    prompts: [],
    errors: [],
    projects: []
  };

  try {
    // Test directory name validation
    const directoryValidation = {
      name: 'Directory Name Validation',
      tests: [
        { input: '', expected: false, message: 'should reject empty input' },
        { input: 'valid-name', expected: true, message: 'should accept valid name' },
        { input: 'invalid@name', expected: false, message: 'should reject invalid characters' },
      ]
    };

    const validateDirectory = (input) => {
      if (!input.length) return 'Project name is required';
      if (!/^[a-zA-Z0-9-_]+$/.test(input)) return 'Project name can only contain letters, numbers, dashes and underscores';
      return true;
    };

    directoryValidation.tests.forEach(test => {
      const result = validateDirectory(test.input);
      const passed = (result === true) === test.expected;
      if (!passed) {
        results.errors.push(`Directory validation failed: ${test.message}`);
      }
    });
    results.prompts.push(directoryValidation);

    // Test framework choices
    const frameworkChoices = ['React', 'Next.js', 'Vue', 'Svelte', 'Angular', 'Nuxt', 'Qwik', 'Remix', 'SolidJS', 'SvelteKit', 'Vue', 'React Native'];
    results.prompts.push({
      name: 'Framework Choices',
      choices: frameworkChoices
    });

    // Test SDK generation choices
    const genChoices = ['Gen1', 'Gen2'];
    results.prompts.push({
      name: 'SDK Generation Choices',
      choices: genChoices
    });

    // Clean up previous test results
    await fs.remove(path.join(process.cwd(), TEST_DIR));
    await fs.ensureDir(path.join(process.cwd(), TEST_DIR));

    // Test template filtering and create projects
    const templateTests = [];
    for (const framework of frameworkChoices) {
      for (const gen of genChoices) {
        try {
          const filteredTemplates = examples.filter(example => {
            const category = utils.categorizeTemplate(example);
            return category?.framework === framework && category?.gen === gen;
          });

          const test = {
            framework,
            gen,
            templatesFound: filteredTemplates.length,
            templates: filteredTemplates.map(template => ({
              name: `${template} ${chalk.gray(`(${utils.getTemplateUrl(template)})`)}`,
              value: template
            }))
          };

          // Create test projects for valid templates
          if (filteredTemplates.length > 0) {
            for (const template of filteredTemplates) {
              const projectResult = await createTestProject(framework, gen, template);
              results.projects.push({
                framework,
                gen,
                template,
                ...projectResult
              });
            }
          }

          templateTests.push(test);
        } catch (error) {
          results.errors.push(`Failed to filter templates for ${framework} ${gen}: ${error.message}`);
        }
      }
    }
    results.prompts.push({
      name: 'Template Filtering',
      tests: templateTests
    });

  } catch (error) {
    results.errors.push(`Test suite failed: ${error.message}`);
  }

  return results;
}

async function runTests() {
  log.title('Running CLI Prompt Tests');

  const results = await testPromptChoices();
  
  log.title('Test Results');

  // Display prompt test results
  results.prompts.forEach(prompt => {
    log.info(`\nTesting: ${prompt.name}`);
    
    if (prompt.tests) {
      prompt.tests.forEach(test => {
        if (prompt.name === 'Template Filtering') {
          const status = test.templatesFound > 0 ? chalk.green('✓') : chalk.yellow('⚠');
          console.log(`  ${status} ${test.framework} - ${test.gen}: ${test.templatesFound} templates`);
          if (test.templatesFound > 0) {
            test.templates.forEach(template => {
              console.log(`    - ${template.name}`);
            });
          }
        } else {
          console.log(`  - ${test.message}`);
        }
      });
    } else if (prompt.choices) {
      console.log('  Available choices:');
      prompt.choices.forEach(choice => {
        console.log(`    - ${choice}`);
      });
    }
  });

  // Display project creation results
  if (results.projects.length > 0) {
    log.info('\nProject Creation Results:');
    results.projects.forEach(project => {
      const status = project.success ? chalk.green('✓') : chalk.red('✖');
      console.log(`  ${status} ${project.framework} - ${project.gen} - ${project.template}`);
      if (project.success) {
        console.log(chalk.gray(`    Created at: ${project.path}`));
      } else {
        console.log(chalk.red(`    Failed: ${project.error}`));
      }
    });
  }

  // Display errors if any
  if (results.errors.length > 0) {
    log.error('\nErrors:');
    results.errors.forEach(error => {
      console.log(chalk.red(`  - ${error}`));
    });
  }

  // Summary
  console.log('\nSummary:');
  console.log(`Total Prompts Tested: ${results.prompts.length}`);
  console.log(`Projects Created: ${chalk.cyan(results.projects.filter(p => p.success).length)}`);
  console.log(`Projects Failed: ${chalk.red(results.projects.filter(p => !p.success).length)}`);
  console.log(`Errors Found: ${chalk.red(results.errors.length)}`);

  // Exit with appropriate code
  process.exit(results.errors.length > 0 ? 1 : 0);
}

runTests().catch(error => {
  log.error('Test runner failed:', error.message);
  process.exit(1);
}); 
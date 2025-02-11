#!/usr/bin/env node

const inquirer = require("inquirer");
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const ProgressBar = require('progress');
const chalk = require('chalk');

const ROOT_EXAMPLES_DIR = "packages/sdks/snippets";
const GITHUB_RAW_URL = "https://raw.githubusercontent.com/BuilderIO/builder/main";
const GITHUB_HTML_URL = "https://github.com/BuilderIO/builder/tree/main";

// Export shared constants
const CONSTANTS = {
  ROOT_EXAMPLES_DIR,
  GITHUB_HTML_URL,
  GITHUB_RAW_URL
};

const utils = {
  categorizeTemplate(templateName) {
    const isGen1 = templateName.startsWith('gen1-');
    const gen = isGen1 ? 'Gen1' : 'Gen2';

    if (isGen1) {
      templateName = templateName.replace('gen1-', '');
    }
    
    if (templateName.startsWith('react-native')) {
      return { framework: 'React Native', gen };
    }
    if (templateName.startsWith('react-sdk')) {
      return { framework: 'Next.js', gen };
    }

    const frameworkPatterns = {
      'angular': {
        name: 'Angular',
        match: (name) => name.startsWith('angular'),
      },
      'solidjs': {
        name: 'SolidJS',
        match: (name) => name.startsWith('solidjs'),
      },
      'react': {
        name: 'React',
        match: (name) => name === 'react' || name.startsWith('react-') && !name.startsWith('react-native') && !name.startsWith('react-sdk'),
      },
      'hydrogen': {
        name: 'Hydrogen',
        match: (name) => name.startsWith('hydrogen'),
      },
      'next': {
        name: 'Next.js',
        match: (name) => name.startsWith('next'),
      },
      'vue': {
        name: 'Vue',
        match: (name) => name === 'vue',
      },
      'nuxt': {
        name: 'Nuxt',
        match: (name) => name.startsWith('nuxt'),
      },
      'qwik': {
        name: 'Qwik',
        match: (name) => name.startsWith('qwik'),
      },
      'remix': {
        name: 'Remix',
        match: (name) => name.startsWith('remix'),
      },
      'svelte': {
        name: 'Svelte',
        match: (name) => name === 'svelte',
      },
      'sveltekit': {
        name: 'SvelteKit',
        match: (name) => name.startsWith('sveltekit'),
      }
    };
    
    for (const [_, framework] of Object.entries(frameworkPatterns)) {
      if (framework.match(templateName)) {
        return { framework: framework.name, gen };
      }
    }

    return null;
  },

  getTemplateUrl(templateName) {
    return `${GITHUB_HTML_URL}/${ROOT_EXAMPLES_DIR}/${templateName}`;
  },

  log: {
    info: (...args) => console.log('ℹ', ...args),
    success: (...args) => console.log(chalk.green('✔'), ...args),
    error: (...args) => console.log(chalk.red('✖'), ...args),
    warn: (...args) => console.log(chalk.yellow('⚠'), ...args),
    title: (...args) => console.log(chalk.bold('\n🔨', ...args)),
  }
};

async function getExampleFolders() {
  try {
    const response = await axios.get(`${GITHUB_HTML_URL}/${ROOT_EXAMPLES_DIR}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const html = response.data;
    const dirRegex = new RegExp(`href="/BuilderIO/builder/tree/main/${ROOT_EXAMPLES_DIR}/([^"]+)"`, 'g');
    const examples = new Set();
    
    let match;
    while ((match = dirRegex.exec(html)) !== null) {
      examples.add(match[1]);
    }

    return Array.from(examples);
  } catch (error) {
    console.error("Error fetching examples:", error.message);
    process.exit(1);
  }
}

async function getFilesInDirectory(dirPath) {
  try {
    const response = await axios.get(`${GITHUB_HTML_URL}/${dirPath}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const html = response.data;
    const fileRegex = new RegExp(`href="/BuilderIO/builder/blob/main/${dirPath}/([^"]+)"`, 'g');
    const dirRegex = new RegExp(`href="/BuilderIO/builder/tree/main/${dirPath}/([^"]+)"`, 'g');
    
    const files = new Set();
    const dirs = new Set();
    
    let match;
    while ((match = fileRegex.exec(html)) !== null) {
      files.add(match[1]);
    }
    while ((match = dirRegex.exec(html)) !== null) {
      dirs.add(match[1]);
    }

    return { files: Array.from(files), dirs: Array.from(dirs) };
  } catch (error) {
    console.error(`Error fetching directory contents: ${dirPath}`, error.message);
    return { files: [], dirs: [] };
  }
}

async function downloadFile(filePath, targetPath) {
  try {
    const response = await axios.get(`${GITHUB_RAW_URL}/${filePath}`, {
      responseType: 'text',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    await fs.outputFile(targetPath, response.data);
    return { success: true, path: filePath };
  } catch (error) {
    if (error.response?.status !== 404) {
      console.error(`Error downloading ${filePath}:`, error.message);
    }
    return { success: false, path: filePath };
  }
}

async function downloadDirectory(dirPath, targetDir, templateName, progressBar) {
  const { files, dirs } = await getFilesInDirectory(dirPath);
  let downloadedFiles = 0;

  // Update progress bar total with newly discovered files
  progressBar.total += files.length;
  progressBar.curr = Math.min(progressBar.curr, progressBar.total);

  // Create download promises for all files in current directory
  const downloadPromises = files.map(file => {
    const fullPath = `${dirPath}/${file}`;
    const relativePath = fullPath.replace(`${ROOT_EXAMPLES_DIR}/${templateName}/`, '');
    const targetPath = path.join(targetDir, relativePath);
    return downloadFile(fullPath, targetPath).then(result => {
      if (result.success) {
        downloadedFiles++;
        progressBar.tick({
          file: relativePath.padEnd(30).slice(0, 30)
        });
      }
      return result;
    });
  });

  // Download files concurrently with a limit of 5 simultaneous downloads
  const chunkSize = 5;
  for (let i = 0; i < downloadPromises.length; i += chunkSize) {
    const chunk = downloadPromises.slice(i, i + chunkSize);
    await Promise.all(chunk);
  }

  // Process subdirectories concurrently
  const dirPromises = dirs.map(dir => {
    const fullPath = `${dirPath}/${dir}`;
    return downloadDirectory(fullPath, targetDir, templateName, progressBar);
  });

  const dirResults = await Promise.all(dirPromises);
  downloadedFiles += dirResults.reduce((sum, result) => sum + result, 0);

  return downloadedFiles;
}

async function decodeFilePaths(directory) {
  const items = await fs.readdir(directory, { withFileTypes: true });
  
  for (const item of items) {
    const currentPath = path.join(directory, item.name);
    const decodedName = decodeURIComponent(item.name);
    
    if (item.name !== decodedName) {
      const decodedPath = path.join(directory, decodedName);
      try {
        await fs.rename(currentPath, decodedPath);
        utils.log.info(`Decoded: ${item.name} → ${decodedName}`);
      } catch (error) {
        utils.log.warn(`Failed to decode ${item.name}: ${error.message}`);
      }
    }
    
    if (item.isDirectory()) {
      await decodeFilePaths(path.join(directory, decodedName));
    }
  }
}

async function downloadTemplate(template, targetDir) {
  try {
    const templatePath = `${ROOT_EXAMPLES_DIR}/${template}`;
    
    // Create progress bar with initial total of 0
    const progressBar = new ProgressBar('  downloading [:bar] :current/:total :percent :etas ' + chalk.gray(':file'), {
      complete: '=',
      incomplete: ' ',
      width: 20,
      total: 0
    });

    const downloadedFiles = await downloadDirectory(templatePath, targetDir, template, progressBar);

    if (downloadedFiles === 0) {
      utils.log.error('No files were downloaded. The template might be empty or not exist.');
      process.exit(1);
    }

    // Decode URL-encoded file paths after downloading
    await decodeFilePaths(targetDir);

    // Create a basic package.json if it doesn't exist
    const packagePath = path.join(targetDir, 'package.json');
    if (!await fs.pathExists(packagePath)) {
      const basicPackage = {
        name: path.basename(targetDir),
        version: '0.1.0',
        private: true,
      };
      await fs.writeJSON(packagePath, basicPackage, { spaces: 2 });
    }

    utils.log.success(`\nTemplate files downloaded successfully! (${chalk.cyan(downloadedFiles)} files)`);
  } catch (error) {
    utils.log.error("\nError downloading template:", error.message);
    process.exit(1);
  }
}

async function updateWorkspaceVersions(projectDir, providedVersion = 'latest') {
  const packageJsonPath = path.join(projectDir, 'package.json');
  
  try {
    if (await fs.pathExists(packageJsonPath)) {
      utils.log.info('Updating workspace dependencies...');
      
      const packageJson = await fs.readJson(packageJsonPath);
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      for (const [pkg, version] of Object.entries(dependencies)) {
        if (version.includes('workspace:*')) {
          if (packageJson.dependencies?.[pkg]) {
            packageJson.dependencies[pkg] = providedVersion;
          }
          if (packageJson.devDependencies?.[pkg]) {
            packageJson.devDependencies[pkg] = providedVersion;
          }
        }
      }

      packageJson.name = path.basename(projectDir);
      delete packageJson.scripts.test;
      
      await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
    }
  } catch (error) {
    utils.log.warn('Error updating workspace versions:', error.message);
  }
}

async function updateApiKey(projectDir, newApiKey) {
  if (!newApiKey) {
    utils.log.warn('No API key provided, skipping API key update');
    return;
  }
  
  const defaultApiKey = 'ee9f13b4981e489a9a1209887695ef2b';
  
  try {
    utils.log.info('Updating API keys...');
    
    const getAllFiles = async (dir) => {
      const files = await fs.readdir(dir);
      const filePaths = await Promise.all(
        files.map(async file => {
          const filePath = path.join(dir, file);
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            return getAllFiles(filePath);
          } else {
            return filePath;
          }
        })
      );
      return filePaths.flat();
    };

    const files = await getAllFiles(projectDir);
    
    const textExtensions = ['.js', '.jsx', '.ts', '.tsx', '.svelte', '.vue', '.html', '.json', '.env', '.yml', '.yaml', '.md'];
    
    for (const file of files) {
      if (textExtensions.some(ext => file.toLowerCase().endsWith(ext))) {
        try {
          const content = await fs.readFile(file, 'utf8');
          if (content.includes(defaultApiKey)) {
            const updatedContent = content.replace(new RegExp(defaultApiKey, 'g'), newApiKey);
            await fs.writeFile(file, updatedContent);
          }
        } catch (error) {
          utils.log.warn(`Error processing file ${file}:`, error.message);
        }
      }
    }
  } catch (error) {
    utils.log.warn('Error updating API keys:', error.message);
  }
}

function filterTemplates(examples, framework, gen) {
  const filteredExamples = examples.filter(example => {
    const category = utils.categorizeTemplate(example);
    return category?.framework === framework && category?.gen === gen;
  });

  if (filteredExamples.length === 0) {
    utils.log.error(`No templates found for ${framework} with ${gen}`);
    process.exit(1);
  }

  return filteredExamples.map(example => ({
    name: `${example} ${chalk.gray(`(${utils.getTemplateUrl(example)})`)}`,
    value: example,
  }));
}

async function main() {
  utils.log.title('Builder.io Project Generator');
  console.log(chalk.gray('Create a new Builder.io project from templates\n'));

  const { directory, framework, gen } = await inquirer.prompt([
    {
      type: "input",
      name: "directory",
      message: "Project name:",
      default: 'my-builder-project',
      validate: (input) => {
        if (!input.length) return 'Project name is required';
        if (!/^[a-zA-Z0-9-_]+$/.test(input)) return 'Project name can only contain letters, numbers, dashes and underscores';
        return true;
      },
    },
    {
      type: 'list',
      name: 'framework',
      message: 'Select a framework:',
      default: 'React',
      choices: ['React', 'Next.js', 'Vue', 'Svelte', 'Angular', 'Nuxt', 'Qwik', 'Remix', 'SolidJS', 'SvelteKit', 'Vue', 'React Native'],
    },
    {
      type: 'list',
      name: 'gen',
      message: 'Select the generation of SDK:',
      choices: ['Gen1', 'Gen2'],
      default: 'Gen2',
    },
  ]);

  utils.log.info(chalk.magenta('Fetching available templates...'));
  const examples = await getExampleFolders();

  if (!examples || examples.length === 0) {
    utils.log.error('No templates found in the examples directory');
    process.exit(1);
  }

  const { template, apiKey, version } = await inquirer.prompt([
    {
      type: "list",
      name: "template",
      message: "Select a template:",
      choices: filterTemplates(examples, framework, gen),
      format: (template) => {
        const choice = filterTemplates(examples, framework, gen)
          .find(t => t.value === template);
        console.log(chalk.gray(`\nTemplate URL: ${choice.url}`));
        return template;
      }
    },
    {
      type: "input",
      name: "apiKey",
      message: "Your Builder.io API key:",
    },
    {
      type: "input",
      name: "version",
      message: "Version of the SDK to use:",
      default: 'latest',
    }
  ]);

  utils.log.info(`\nCreating project in ${chalk.cyan(directory)}...`);
  const projectDir = path.join(process.cwd(), directory);
  await fs.ensureDir(projectDir);

  await downloadTemplate(template, projectDir);

  await updateWorkspaceVersions(projectDir, version);

  await updateApiKey(projectDir, apiKey);

  utils.log.success(`\nProject created successfully in ${chalk.cyan(projectDir)}`);
  
  console.log(chalk.bold('\n📦 Next steps:'));
  console.log(chalk.gray('\nRun these commands in your terminal:'));
  console.log('\n  cd', chalk.cyan(directory));
  console.log('  npm', chalk.cyan('install'));
  console.log('  npm', chalk.cyan('run dev'), '\n');
}

main().catch((error) => {
  utils.log.error("Error:", error.message);
  process.exit(1);
});

module.exports = {
  getExampleFolders,
  generateTemplate: async ({ directory, apiKey, template, silent = false }) => {
    const projectDir = path.join(process.cwd(), directory);
    await fs.ensureDir(projectDir);
    await downloadTemplate(template, projectDir);
    await updateWorkspaceVersions(projectDir);
    await updateApiKey(projectDir, apiKey);
    return projectDir;
  },
  CONSTANTS,
  utils
}; 

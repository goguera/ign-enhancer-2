#!/usr/bin/env node

/**
 * IGN Enhancer 2 - Publish Script
 * 
 * This script:
 * 1. Builds the extension for all supported browsers
 * 2. Ensures proper package naming (.zip for Chrome, .xpi for Firefox, .crx for Opera)
 * 3. Creates a release directory with all packages
 * 4. Optionally uploads to GitHub as a release
 * 
 * Usage:
 *   npm run publish [-- --github-release --tag v1.0.0]
 *   
 * Options:
 *   --github-release     Create a GitHub release
 *   --tag <tag>          Tag for the GitHub release (default: vX.Y.Z from package.json)
 *   --notes <path>       Path to release notes file (default: RELEASE_NOTES.md if exists)
 *   --token <token>      GitHub token (default: uses GITHUB_TOKEN env var)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Octokit } = require('@octokit/rest');
const package = require('../package.json');

// Configuration
const BROWSERS = ['chrome', 'firefox', 'opera'];
const EXTENSION_DIR = path.join(__dirname, '..', 'extension');
const RELEASE_DIR = path.join(__dirname, '..', 'release');
const EXTENSION_TYPES = {
  chrome: 'zip',
  firefox: 'xpi',
  opera: 'crx'
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  githubRelease: args.includes('--github-release'),
  tag: getArgValue(args, '--tag') || `v${package.version}`,
  notes: getArgValue(args, '--notes'),
  token: getArgValue(args, '--token') || process.env.GITHUB_TOKEN
};

// Main execution
async function main() {
  console.log('🚀 IGN Enhancer 2 - Publish Script');
  console.log('------------------------------------');
  console.log(`Version: ${package.version}`);
  
  try {
    await buildExtensions();
    await prepareReleaseDirectory();
    
    if (options.githubRelease) {
      await createGitHubRelease();
    }
    
    console.log('\n✅ Publish completed successfully!');
  } catch (error) {
    console.error('\n❌ Publish failed:', error.message);
    process.exit(1);
  }
}

// Build extensions for all browsers
async function buildExtensions() {
  console.log('\n📦 Building extensions...');
  
  // Detect package manager
  let packageManager = 'npm';
  if (fs.existsSync('yarn.lock')) {
    packageManager = 'yarn';
  } else if (fs.existsSync('pnpm-lock.yaml')) {
    packageManager = 'pnpm';
  }
  
  // Run the build command for all browsers
  try {
    execSync(`${packageManager} run build`, { stdio: 'inherit' });
    console.log('✅ All builds completed');
  } catch (error) {
    throw new Error(`Build failed: ${error.message}`);
  }
}

// Prepare release directory with properly named files
async function prepareReleaseDirectory() {
  console.log('\n📁 Preparing release directory...');
  
  // Create release directory if it doesn't exist
  if (!fs.existsSync(RELEASE_DIR)) {
    fs.mkdirSync(RELEASE_DIR, { recursive: true });
  } else {
    // Clean up existing files
    fs.readdirSync(RELEASE_DIR).forEach(file => {
      fs.unlinkSync(path.join(RELEASE_DIR, file));
    });
  }
  
  // Copy and rename files for each browser
  for (const browser of BROWSERS) {
    const sourceFile = path.join(EXTENSION_DIR, `${browser}.${EXTENSION_TYPES[browser]}`);
    const releaseFileName = `ign-enhancer-2-${package.version}-${browser}.${EXTENSION_TYPES[browser]}`;
    const targetFile = path.join(RELEASE_DIR, releaseFileName);
    
    if (fs.existsSync(sourceFile)) {
      fs.copyFileSync(sourceFile, targetFile);
      console.log(`✓ Created ${releaseFileName}`);
    } else {
      console.warn(`⚠ Warning: ${sourceFile} not found`);
    }
  }
  
  console.log('✅ Release files prepared');
}

// Create a GitHub release and upload assets
async function createGitHubRelease() {
  console.log('\n🌐 Creating GitHub release...');
  
  if (!options.token) {
    throw new Error('GitHub token is required. Set GITHUB_TOKEN environment variable or use --token option.');
  }
  
  // Extract repo information from package.json
  const repoUrl = package.repository;
  const [owner, repo] = extractRepoInfo(repoUrl);
  
  if (!owner || !repo) {
    throw new Error(`Could not extract owner/repo from ${repoUrl}`);
  }
  
  // Read release notes if specified
  let releaseNotes = '';
  if (options.notes) {
    if (fs.existsSync(options.notes)) {
      releaseNotes = fs.readFileSync(options.notes, 'utf8');
    }
  } else if (fs.existsSync('RELEASE_NOTES.md')) {
    releaseNotes = fs.readFileSync('RELEASE_NOTES.md', 'utf8');
  }
  
  if (!releaseNotes) {
    releaseNotes = `# IGN Enhancer 2 ${options.tag}\n\nRelease generated automatically by publish script.`;
  }
  
  // Initialize Octokit
  const octokit = new Octokit({
    auth: options.token
  });
  
  try {
    // Create the release
    console.log(`Creating release ${options.tag} for ${owner}/${repo}`);
    
    const release = await octokit.repos.createRelease({
      owner,
      repo,
      tag_name: options.tag,
      name: `IGN Enhancer 2 ${options.tag}`,
      body: releaseNotes,
      draft: false,
      prerelease: false
    });
    
    console.log(`✓ Created release: ${release.data.html_url}`);
    
    // Upload assets
    const releaseFiles = fs.readdirSync(RELEASE_DIR);
    
    for (const file of releaseFiles) {
      const filePath = path.join(RELEASE_DIR, file);
      const fileStats = fs.statSync(filePath);
      
      console.log(`Uploading ${file} (${formatFileSize(fileStats.size)})...`);
      
      await octokit.repos.uploadReleaseAsset({
        owner,
        repo,
        release_id: release.data.id,
        name: file,
        data: fs.readFileSync(filePath)
      });
      
      console.log(`✓ Uploaded ${file}`);
    }
    
    console.log('✅ GitHub release completed');
  } catch (error) {
    throw new Error(`GitHub release failed: ${error.message}`);
  }
}

// Helper functions
function getArgValue(args, flag) {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return null;
}

function extractRepoInfo(repoUrl) {
  if (!repoUrl) return [null, null];
  
  // Handle different repo URL formats
  let match;
  
  // Format: https://github.com/owner/repo.git
  match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (match) return [match[1], match[2]];
  
  // Format: git@github.com:owner/repo.git
  match = repoUrl.match(/github\.com:([^\/]+)\/([^\/\.]+)/);
  if (match) return [match[1], match[2]];
  
  // Format: owner/repo
  match = repoUrl.match(/^([^\/]+)\/([^\/\.]+)$/);
  if (match) return [match[1], match[2]];
  
  return [null, null];
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Run the script
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 
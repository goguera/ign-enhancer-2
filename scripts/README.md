# IGN Enhancer 2 - Release Script

This script automates the build and release process for the IGN Enhancer 2 browser extension.

## Features

- Builds the extension for all supported browsers (Chrome, Firefox, Opera)
- Ensures proper file naming conventions (.zip for Chrome, .xpi for Firefox, .crx for Opera)
- Creates a release directory with properly named packages
- Optionally creates a GitHub release and uploads assets
- Automatically detects and uses npm, yarn, or pnpm

## Usage

### Basic Usage

To build and package the extension:

```bash
npm run release
# or
yarn release
# or
pnpm release
```

This will:
1. Build the extension for all browsers
2. Create a `release` directory
3. Copy and rename the packaged extensions to the release directory

### Creating a GitHub Release

To create a GitHub release:

```bash
npm run release -- --github-release
# or
yarn release --github-release
# or
pnpm release -- --github-release
```

This requires a GitHub token with appropriate permissions. You can:

1. Set the `GITHUB_TOKEN` environment variable
2. Or pass the token directly: `npm run release -- --github-release --token YOUR_TOKEN`

### Additional Options

```bash
npm run release -- --github-release --tag v2.1.0 --notes CHANGELOG.md
```

Options:
- `--github-release`: Create a GitHub release
- `--tag <tag>`: Specify the tag for the GitHub release (default: v{version} from package.json)
- `--notes <path>`: Path to release notes file (default: RELEASE_NOTES.md if it exists)
- `--token <token>`: GitHub token (default: GITHUB_TOKEN environment variable)
- `--dry-run`: Test the GitHub release process without actually creating a release

### Testing GitHub Releases

You can test the GitHub release functionality without actually creating a release:

```bash
npm run release -- --github-release --dry-run
```

This will show you what would be uploaded and how the release would be configured.

## GitHub Token

To create a GitHub release, you need a personal access token with the `repo` scope.

1. Go to GitHub > Settings > Developer settings > Personal access tokens
2. Generate a new token with the `repo` scope
3. Use this token with the `--token` option or set it as the `GITHUB_TOKEN` environment variable

## Continuous Integration

You can integrate this script into your CI workflow (GitHub Actions, CircleCI, etc.) to automate releases.

Example GitHub Actions workflow snippet:

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm ci
      - name: Build and Release
        run: npm run release -- --github-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
``` 
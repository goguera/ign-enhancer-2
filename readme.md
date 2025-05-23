# IGN Enhancer 2

Browser extension to enhance the IGN forums experience.

## Features

- Auto flood
- Primeira página infinita
- Fechar aba automaticamente após enviar o post (configurável)
- Modo Quick Flood
- Gerenciador de contas

## Architecture

IGN Enhancer 2 follows a modular architecture that separates business logic from presentation code. This ensures maintainability and extensibility as the project grows.

### Core Components

#### Directory Structure

```
source/
├── Background/           # Background scripts
├── ContentScript/        # Content scripts (thin wrappers)
├── Injections/           # Directly injected scripts
├── lib/                  # Business logic and utilities
│   ├── features/         # Feature-specific modules
│   │   ├── autoclose/    
│   │   ├── autoflood/    
│   │   ├── quick-flood/
│   │   └── neverending/  
│   ├── services/         # Cross-feature services
│   ├── types/            # TypeScript type definitions
│   └── utils/            # Utility functions
├── Login/                # Login page components
└── Options/              # Extension options page components
```

#### Architecture Principles

1. **Separation of Concerns**
   - **Content Scripts**: Act as thin wrappers that only initialize and connect to business logic
   - **Feature Modules**: Contain all business logic related to specific features
   - **Services**: Provide shared functionality across features
   - **Utils**: Common utility functions used throughout the codebase

2. **Module Structure**
   - Each feature should be self-contained in its respective directory
   - A feature module should export functions that can be called from content scripts
   - State management should be handled within the feature module

3. **Extension Messaging**
   - Background script acts as the central coordinator
   - Communication between components happens via messaging
   - Message handlers are structured to support various commands

### Key Components

#### Background Script

The background script (`/source/Background/index.ts`) serves as the central coordinator for the extension. It:
- Handles browser action clicks
- Manages message passing between components
- Coordinates background services like the message queue

#### Content Scripts

Content scripts are thin wrappers that import and initialize features from the library. They:
- Are injected into specific pages based on URL patterns (defined in manifest.json)
- Should NOT contain business logic
- Import and call initialization functions from feature modules

Example:
```typescript
// thread-post-interceptor.ts
import { initBackgroundPosting } from '@lib/features/background-posting/background-posting';

console.log('Thread post interceptor script loaded');
initBackgroundPosting();
```

#### Feature Modules

Feature modules contain the business logic for specific features. They:
- Export initialization functions called by content scripts
- Handle feature-specific state management
- Implement UI components and DOM manipulation
- Communicate with background services via messaging

#### Services

Service modules provide functionality that can be used across multiple features:
- **Message Queue Service**: Manages background posting of messages
- **Account Management**: Handles storing and switching between user accounts

### Data Flow

1. Content script is injected into the page
2. Content script imports and calls initialization functions from feature modules
3. Feature module initializes UI components and sets up event listeners
4. User interactions trigger feature module functions
5. Feature module communicates with background script via messages
6. Background script processes requests and returns responses
7. Feature module updates UI based on responses

### Adding New Features

To add a new feature:

1. Create a new directory in `/source/lib/features/your-feature/`
2. Implement your business logic in a module that exports initialization functions
3. Create a thin content script wrapper in `/source/ContentScript/`
4. Update `manifest.json` to register your content script with appropriate URL patterns
5. Update `webpack.config.js` to include your content script in the build

## Development

### Prerequisites
- Node.js (version specified in .nvmrc)
- npm or yarn

### Setup
```
npm install
# or
yarn
```

### Development Build
```
# For Chrome
npm run dev:chrome
# or
yarn dev:chrome

# For Firefox
npm run dev:firefox
# or
yarn dev:firefox

# For Opera
npm run dev:opera
# or
yarn dev:opera
```

### Production Build
```
# Build for all browsers
npm run build
# or
yarn build

# Build for specific browser
npm run build:chrome
npm run build:firefox
npm run build:opera
# or
yarn build:chrome
yarn build:firefox
yarn build:opera
```

## Publishing

The extension includes a release script that automates the build and release process:

```
npm run release
# or
yarn release
# or
pnpm release
```

This will:
1. Build the extension for all supported browsers
2. Create a `release` directory with properly named packages (.zip for Chrome, .xpi for Firefox, .crx for Opera)

### Creating a GitHub Release

To create a GitHub release and upload the extension packages:

```
npm run release -- --github-release
# or
yarn release --github-release
# or
pnpm release -- --github-release
```

For more options and details, see the [Publish Script Documentation](./scripts/README.md).

### Automated Releases with GitHub Actions

The project includes GitHub Actions workflows for automated releases:

1. **Tag-based Releases**: 
   - Simply push a tag in the format `v*` (e.g., `v2.1.0`)
   - GitHub Actions will automatically build and publish a release

   ```bash
   git tag v2.1.0
   git push origin v2.1.0
   ```

2. **Manual Releases**:
   - Go to the "Actions" tab in your GitHub repository
   - Select the "Manual Release" workflow
   - Click "Run workflow"
   - Enter the version number and click "Run workflow"

These workflows will:
- Build the extension for all browsers
- Create a GitHub release with the appropriate version
- Upload all browser packages as release assets
- Store artifacts in the workflow run

### Best Practices

1. Keep content scripts minimal - they should only initialize features
2. Put all business logic in the lib/features directory
3. Write reusable utility functions in lib/utils
4. Define TypeScript interfaces for all message structures
5. Use descriptive command names for message handlers
6. Document public APIs with JSDoc comments

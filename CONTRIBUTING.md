# Contributing to HOMESERVER Website Platform

Thank you for your interest in contributing to the HOMESERVER platform! We're building professional-grade digital sovereignty infrastructure that provides complete independence from Big Tech surveillance. Your contributions help advance privacy-respecting technology and empower users worldwide.

## Table of Contents

- [Code of Participation](#code-of-participation)
- [Ways to Contribute](#ways-to-contribute)
- [Contributor License Agreement](#contributor-license-agreement)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Quality Standards](#code-quality-standards)
- [Testing Requirements](#testing-requirements)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)
- [Architecture Overview](#architecture-overview)
- [Getting Help](#getting-help)

## Code of Participation

We expect all contributors to engage professionally and respectfully. This is a technical project with high standards, and we value clear communication, constructive feedback, and collaborative problem-solving.

## Ways to Contribute

### Code Contributions
- **Backend**: Python/Flask API endpoints, database models, business logic
- **Frontend**: React/TypeScript components, state management, UI/UX improvements
- **Premium Tabs**: New premium modules or enhancements to existing tabs
- **Bug Fixes**: Address reported issues and edge cases
- **Performance**: Optimize queries, reduce bundle size, improve responsiveness

### Non-Code Contributions
- **Documentation**: Improve inline comments, API documentation, or architecture guides
- **Testing**: Report bugs with detailed reproduction steps
- **Design**: Propose UI/UX improvements or accessibility enhancements
- **Security**: Report vulnerabilities responsibly (see below)

## Contributor License Agreement

**IMPORTANT**: This repository requires a signed Contributor License Agreement (CLA) before your first contribution can be merged.

### Why We Require a CLA

The HOMESERVER website platform is business-critical infrastructure. The CLA ensures:
- Clear legal ownership and licensing
- Ability to offer commercial support and services
- Protection for both contributors and HOMESERVER LLC
- Flexibility to evolve licensing as the project grows

### How to Sign the CLA

1. **First-time contributors**: You'll be prompted to sign the CLA when you submit your first pull request
2. **CLA Assistant**: We use an automated CLA signing process
3. **One-time process**: You only need to sign once for this repository
4. **Quick and simple**: Takes less than 2 minutes

Your CLA signature will be tracked, and PRs cannot be merged without a signed CLA on file.

## Getting Started

### Prerequisites

**Backend Development:**
- Python 3.9+
- Flask and related dependencies (see `requirements.txt`)
- PostgreSQL (for local development)
- Understanding of REST APIs and Flask patterns

**Frontend Development:**
- Node.js 18+ and npm
- TypeScript knowledge
- React 18+ experience
- Redux Toolkit for state management

### Repository Setup

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone git@github.com:YOUR_USERNAME/website.git
   cd website
   ```

3. **Add upstream remote**:
   ```bash
   git remote add upstream git@github.com:homeserversltd/website.git
   ```

4. **Install dependencies**:
   ```bash
   # Backend
   pip install -r requirements.txt
   
   # Frontend
   npm install
   ```

5. **Set up development environment**: Configure your local `homeserver.json` for development

## Development Workflow

### 1. Create a Feature Branch

Always work on a feature branch in your fork:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 2. Make Your Changes

- **Backend changes**: Edit Python files in `backend/`
- **Frontend changes**: Edit TypeScript/React files in `src/`
- **Premium tabs**: Work within `premium/` directory structure
- **Keep changes focused**: One feature or fix per branch

### 3. Test Thoroughly

See [Testing Requirements](#testing-requirements) below.

### 4. Commit Your Changes

Follow our [Commit Message Guidelines](#commit-message-guidelines).

### 5. Keep Your Fork Updated

```bash
git fetch upstream
git rebase upstream/master
```

### 6. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

### 7. Open a Pull Request

Submit a PR from your fork to the upstream repository.

## Code Quality Standards

### Backend (Python/Flask)

- **PEP 8 compliance**: Follow Python style guidelines
- **Type hints**: Use type annotations where appropriate
- **Error handling**: Comprehensive try/catch blocks with meaningful error messages
- **Logging**: Use the platform's logging utilities for debugging
- **Security**: Validate all inputs, sanitize user data, follow security best practices
- **Documentation**: Docstrings for all functions, classes, and modules

### Frontend (React/TypeScript)

- **TypeScript strict mode**: No `any` types without justification
- **Component structure**: Functional components with hooks
- **State management**: Use Redux Toolkit for global state
- **Styling**: Follow existing CSS patterns and naming conventions
- **Accessibility**: ARIA labels, keyboard navigation, semantic HTML
- **Performance**: Memoization where appropriate, avoid unnecessary re-renders

### Premium Tab Architecture

Premium tabs follow a specific structure:
- `backend/`: Python module with routes and business logic
- `frontend/`: React components and styles
- `homeserver.patch.json`: Configuration and integration manifest
- `index.json`: Tab metadata
- `permissions/`: Sudoers policy files
- `system/`: Systemd services or system integration

Follow existing tab patterns when creating new premium modules.

## Testing Requirements

All contributions must be tested before submission. Include a description of your testing in the PR.

### Backend Testing

- **Manual API testing**: Use curl, Postman, or similar tools
- **Test all endpoints**: Verify success cases and error handling
- **Database operations**: Ensure queries work correctly and don't corrupt data
- **Edge cases**: Test boundary conditions and unusual inputs

### Frontend Testing

- **Browser testing**: Test in Chrome, Firefox, and Safari if possible
- **Responsive design**: Verify on desktop and mobile viewports
- **User interactions**: Click through all UI flows
- **Error states**: Verify error messages display correctly
- **Console logs**: Ensure no unexpected errors or warnings

### Integration Testing

- **Backend + Frontend**: Test complete user workflows
- **Premium tabs**: Verify tab installation, configuration, and uninstallation
- **Services**: If your changes affect system services, test service management

### Testing Documentation

In your PR description, include:
1. **What you tested**: Specific features or scenarios
2. **How you tested**: Tools, browsers, test data used
3. **Test results**: Expected vs. actual behavior
4. **Edge cases**: Unusual scenarios you verified

Example:
```
Testing Performed:
- Tested backup creation API endpoint with curl
- Verified backup list renders correctly in UI (Chrome 120, Firefox 121)
- Tested with 0 backups, 1 backup, and 50+ backups
- Confirmed error handling for invalid backup IDs
- Verified backup deletion requires confirmation
```

## Commit Message Guidelines

Write clear, descriptive commit messages that explain both **what** changed and **why**.

### Format

```
Brief summary of changes (50-72 characters)

Detailed explanation of the changes:
- What was changed and why
- Technical implementation details
- Any breaking changes or migrations needed
- Related issues or discussions

Examples:
- Added user authentication validation
- Fixed memory leak in websocket connections
- Refactored backup state management for clarity
```

### Best Practices

- **Be specific**: "Add backup retention policy" not "Update backup code"
- **Explain why**: Include the motivation for the change
- **Reference issues**: Mention related issue numbers if applicable
- **Keep focused**: One logical change per commit (you can squash later if needed)

### Examples

**Good:**
```
Add rate limiting to backup API endpoints

Implemented per-user rate limiting to prevent API abuse:
- 10 backup operations per minute per user
- Uses Redis for distributed rate limit tracking
- Returns 429 status code when limit exceeded
- Added rate limit headers to responses

This prevents users from overwhelming the system with
simultaneous backup requests.
```

**Also Good:**
```
Fix backup tab not showing completed backups

The backup list component wasn't updating after backup
completion because the websocket event handler wasn't
connected properly. Added proper event listener cleanup
and reconnection logic.

Fixed in BackupList.tsx useEffect hook.
```

## Pull Request Process

### Before Submitting

- [ ] Sign the CLA (required for first contribution)
- [ ] Test your changes thoroughly
- [ ] Update documentation if needed
- [ ] Ensure code follows style guidelines
- [ ] Rebase on latest upstream/master
- [ ] Write a clear PR description

### PR Description Template

```markdown
## Description
Brief summary of what this PR does.

## Motivation
Why is this change needed? What problem does it solve?

## Changes Made
- Specific change 1
- Specific change 2
- Specific change 3

## Testing Performed
Describe your testing process and results.

## Screenshots (if applicable)
Include before/after screenshots for UI changes.

## Checklist
- [ ] CLA signed
- [ ] Code tested thoroughly
- [ ] Documentation updated
- [ ] No console errors or warnings
- [ ] Follows code style guidelines
```

### Review Process

1. **Automated checks**: CLA verification runs automatically
2. **Maintainer review**: A HOMESERVER maintainer will review your PR
3. **Feedback**: Address any requested changes
4. **Approval**: Once approved, your PR will be merged
5. **Merge**: We'll squash commits when merging to keep history clean

### Response Times

We aim to provide initial feedback within 1 week. More complex changes may require additional time for thorough review.

## Architecture Overview

### Backend Structure

```
backend/
├── admin/          # Administrative endpoints
├── auth/           # Authentication and authorization
├── broadcasts/     # Server-sent events
├── indicators/     # System status indicators
├── monitors/       # System monitoring
├── portals/        # Service portals
├── sockets/        # WebSocket handlers
├── stats/          # Statistics and metrics
├── tabman/         # Premium tab management
├── upload/         # File upload handling
└── utils/          # Shared utilities
```

### Frontend Structure

```
src/
├── api/            # API client and endpoints
├── components/     # Reusable React components
├── hooks/          # Custom React hooks
├── store/          # Redux state management
├── styles/         # Global styles
├── tablets/        # Main application tablets
│   ├── admin/      # Administration interface
│   ├── portals/    # Service portals
│   ├── stats/      # Statistics dashboard
│   └── upload/     # Upload interface
└── utils/          # Utility functions
```

### Premium Tab Architecture

Premium tabs are modular plugins that extend HOMESERVER functionality. Each tab is self-contained with its own backend, frontend, and system integration.

## Getting Help

### Resources

- **Documentation**: Check the main README.md and inline code comments
- **Issues**: Browse existing issues for similar problems or questions
- **Architecture**: Review existing code to understand patterns and conventions

### Communication

- **GitHub Issues**: Best for bug reports and feature discussions
- **Pull Request Comments**: For specific questions about your contribution
- **Email**: For private security reports or sensitive matters

### Reporting Security Vulnerabilities

**DO NOT** open public issues for security vulnerabilities.

Instead, email security details to: **owner@arpaservers.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

We take security seriously and will respond promptly to legitimate security reports.

## Recognition

Contributors who have PRs merged will be:
- Listed in our contributors file
- Acknowledged in release notes (for significant contributions)
- Building a public portfolio of professional open-source work

## License

By contributing to this project, you agree that your contributions will be licensed under the terms specified in the signed CLA. The project itself is licensed under GPL-3.0 with additional commercial terms for HOMESERVER LLC.

---

**Thank you for contributing to digital sovereignty and privacy-respecting technology!**

*HOMESERVER LLC - Professional Digital Sovereignty Solutions*


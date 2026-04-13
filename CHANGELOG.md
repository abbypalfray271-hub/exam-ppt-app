# Changelog - Exam PPT App

## [1.5.0-Aurora.Professional] - 2026-04-09

### 🚀 Core Transformations
- **Architectural Refactoring**: Completed a massive decoupling of the core interactive components. Extracted gesture-handling and page-management logic into reusable Hooks (`useCanvasInteraction`, `usePageManager`), reducing `ExtractionCanvas` complexity by 50%.
- **Type Safety Restoration**: Removed all global TypeScript ignores. The entire codebase is now strictly type-safe, ensuring predictable production builds.
- **Aurora White Design System**: Fully implemented the version 1.0 of the "Aurora White" aesthetic—focusing on depth, glassmorphism, and premium motion transitions.

### ⚡ Performance & Efficiency
- **Intelligent Rendering**: Introduced `LazyThumbnail` with `IntersectionObserver` support. Off-screen slides are now pulse-placeholder rendered, drastically reducing DOM pressure and memory usage for large documents.
- **Image Pipeline 2.0**: Standardized image compression and rendering constants across the entire document processing flow.
- **State Optimization**: Refined Zustand persistence to prevent cross-session state corruption and IndexedDB bloat.

### ✨ New Features (Pro)
- **Extreme Shortcuts System**: Added global keyboard support.
    - `F`: Toggle Fullscreen.
    - `Space`: Smart Next Page (In presentation mode).
    - `Esc`: Unified Exit for dialogs/fullscreens.
    - `Arrow Keys`: Rapid slide navigation.
- **Aurora PPT Export Engine**: Completely rewritten export logic.
    - Support for multi-fragment image grouping.
    - Styled cover pages and grouped layouts.
    - High-fidelity preservation of AI-parsed steps and auxiliary diagrams.

### 🛠️ Stability & Refinement
- **LaTeX JSON Rescue**: Implemented a specialized regex-based layer in the JSON parser to detect and auto-escape LaTeX commands (like `\frac`, `\text`) that often cause standard parser crashes.
- **Global ConfirmDialog**: Replaced browser-native `alert/confirm` with a custom Framer-Motion based portal dialog for a consistent UI experience.
- **Loading UX**: Replaced blank initial states with pulse-animated skeleton loaders.

---
*Built with ❤️ by Antigravity AI*

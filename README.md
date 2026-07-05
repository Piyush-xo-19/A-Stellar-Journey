# Stellar Journey: 3D Universe Simulator

## Overview
Stellar Journey is an immersive, high-performance 3D spatial simulator that allows users to traverse from the surface of individual planets all the way out to the boundaries of the theoretical multiverse. Driven entirely by scrolling, the camera flies through multiple orders of cosmic magnitude seamlessly, presenting an educational and visually stunning journey through our universe.

## Core Features and Uniqueness
What separates Stellar Journey from traditional 3D web experiences is its vast, seamless scale. Standard 3D web engines suffer from floating-point inaccuracies and depth-buffer artifacts when rendering distances spanning from mere thousands of units (planetary scale) to tens of millions of units (multiverse scale). 

This project solves those limitations through:
- **Procedural Instancing at Massive Scales:** Using optimized InstancedMesh and Points constructs to render tens of thousands of galaxies, stars, and dark energy tendrils with near-zero performance cost.
- **Dynamic Scale Mathematics:** Instead of fighting web depth-buffer limits, the cosmic macro-structures (Superclusters, Multiverse bubbles, and the Deep Void) are mathematically condensed to fit within safe frustum boundaries, creating the illusion of infinite travel while completely eliminating z-fighting and graphical clipping artifacts.
- **Custom Shaders:** Employs heavily customized mathematical shaders computed directly on the GPU. The Multiverse foam utilizes simulated thin-film iridescence, procedural noise, and Fresnel-based transparency to render thousands of overlapping cosmic bubbles smoothly at 60 FPS.
- **Continuous Scroll Architecture:** Navigation through the cosmos is mapped to standard scrolling. As the user scrolls, the custom CameraRig interpolates position and look-at vectors through distinct cosmic zones, triggering procedural loading, visibility toggles, and UI updates on the fly.

## Technology Stack
- **Core Rendering:** Three.js (WebGL 2.0)
- **Framework and Tooling:** Next.js / Vite
- **UI and Styling:** Vanilla HTML/CSS with custom UI managers.
- **Shaders:** GLSL (Custom Vertex and Fragment Shaders)
- **Math & Interactivity:** High-performance procedural generation, custom raycasting logic, and spherical mathematics for positioning.

## Architecture and Systems
The application is structured around a modular, entity-based rendering architecture.

### Entities
- **StarSystem & Universe:** Handles the inner logic of the Solar System, including planetary orbits, rotations, ring geometry, moons, and procedural asteroid belts.
- **Galaxy & SuperclusterRenderer:** Transitions the user out of the solar system. The SuperclusterRenderer generates a localized outer halo of 30,000 instanced galaxies using procedurally assigned color profiles to represent deep space structures like the Laniakea Supercluster.
- **MultiverseRenderer:** The final macro-scale structure. It renders 1,000 distinct cosmic bubbles spread across a 25-million unit volume, connected by high-frequency dark energy tendrils.

### Engine Components
- **Renderer:** Initializes the Three.js scene, manages WebGL parameters, camera frustum (capped perfectly at 15 million units to prevent depth artifacting), and lighting logic.
- **CameraRig:** An isolated manager responsible for interpolating the camera's position and orientation vectors seamlessly across vast distances based on scroll fraction, while applying real-time mouse parallax effects.
- **InputManager:** Consolidates raycasting, click events, and scroll interception, translating browser inputs into 3D world coordinates.
- **UIManager:** Handles all HTML overlays, including the planetary dashboard, custom crosshair cursor, dynamic navigation dots, and the typewriter-effect description panel.

## Development and Building
The project is bundled via Vite for rapid development and optimized production builds.

To run locally:
1. Install dependencies using standard package managers (npm/yarn/pnpm).
2. Start the development server (npm run dev).
3. Build for production (npm run build).
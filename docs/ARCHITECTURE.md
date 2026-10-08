# GENE Architecture

## Control plane
Vercel hosts the web workspace and API routes. Supabase stores auth, projects, chat history, task state, checkpoints, usage and published builds.

## Agent plane
The agent receives user intent plus project state and chooses typed tools. Tools are the only mechanism allowed to claim that a file changed, a build ran, or a test passed.

## Game plane
2D projects target Phaser. Small 3D projects target Three.js/WebGL. Godot, Unity and Unreal adapters remain separate packages so the core project model stays engine-neutral.

## Verification
A project can only enter Ready state after source validation, runtime startup, first-frame validation, primary-mechanic validation, win/lose validation and performance-budget checks succeed.

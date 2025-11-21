# 🤖 Prompt for Async Coding Agent: Day 1 Module

Subject: Implement "Day 1: Ornament Smash" Module for Advent Calendar

Goal:
Create a self-contained, embeddable web game module ("Ornament Smash") for the Day 1 activity of the Santa Tracker Advent Calendar.

Architecture & Directory Structure:
To maintain a clean codebase, all Advent activities must be nested within a dedicated advent_activities directory. Each day's activity will reside in its own subdirectory.

Root Directory: src/advent_activities/

Day 1 Directory: src/advent_activities/day1_ornament_smash/

File Structure for Day 1:

src/advent_activities/day1_ornament_smash/index.html (The game container)

src/advent_activities/day1_ornament_smash/game.js (The canvas logic, particle system, and game loop)

src/advent_activities/day1_ornament_smash/styles.css (Specific game styles)

src/advent_activities/day1_ornament_smash/README.md (Module-specific integration instructions)

Context:
This is the first of 25 daily unlockable modules. It needs to be lightweight, responsive (mobile-friendly), and visually festive. It will be embedded into the main application (likely via an iframe or direct component import).

Technical Requirements:

Stack: HTML5 Canvas + JavaScript (No external game engines like Phaser/Unity to keep it lightweight).

Styling: Tailwind CSS (consistent with the project's styling).

Output: A main entry file (e.g., index.html or OrnamentSmash.jsx if React) that creates the game container.

Replayability: The game must implement a resetGame() function to restart the loop without reloading the browser page.

Game Design Specifications:

Concept: A "whack-a-mole" style tapping game where users clear ornaments from a Christmas tree.

Visuals:

Background: A stylized, festive Christmas tree (can be CSS shapes or SVG).

Targets: Colorful ornaments (circles with simple shading) that appear at random positions within the tree's triangular boundary.

Particles: When an ornament is clicked/tapped, it should "shatter" into small particle confetti before disappearing.

Polish: Add a subtle "snowfall" effect in the background canvas layer. Ensure the "tree" area calculation is accurate so ornaments don't float in empty space. Make the "smash" feel juicy with a slight screen shake or scale effect on the ornament before it pops.

Gameplay Loop:

Start: A simple "Start Game" overlay.

Action: Ornaments spawn periodically (max 5-8 on screen). Player taps them to clear.

Goal: Clear a total of 20 ornaments to win.

Feedback: A counter shows remaining targets (e.g., "15 Remaining").

Win State: When 0 remain, show a celebration modal (e.g., "Tree Decorated!").

Primary Action: A "Play Again" button that instantly resets the game variables (score, ornaments array) and restarts the round.

Secondary Action: A small "Badge Unlocked" notification if this is the first win.

Audio:

Implement simple synthetic sound effects (using AudioContext) for "pop/smash" and "win" to avoid loading external audio files.

Persistence:

On win, save a flag to localStorage (e.g., santa_advent_day_1_complete = true).

Important: This flag is ONLY for the main app to award a badge. It should NOT lock the game. The game should always remain playable and repeatable.

Documentation & Deliverables:

Complete Source Code: Place all files in src/advent_activities/day1_ornament_smash/.

Module Documentation (src/advent_activities/day1_ornament_smash/README.md):

Detailed instructions on how to embed this module into the main site.

List of configuration options (e.g., targetCount, spawnRate).

Master Index (src/advent_activities/README.md):

Create a root-level README for the advent_activities folder.

This file should serve as a "Table of Contents" for the entire feature, listing Day 1 (and future days) with their paths and local storage keys.

This should also include any technical details of the advent calendar activities.

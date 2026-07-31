# AGENTS.md

## Term Definitions

- **GFC**: Shorthand for Graphical Forecast Creator
- **me**: The one speaking to you
- **you**: The agent reading this.
- **user**: The person using GFC, who could be a meteorologist, student, or weather enthusiast
- **forecast**: What the user is creating in GFC
- **owner / core maintainer / creator**: Wxboysuper/Weatherboysuper, the person writing this document and maintaining the project

# GFC - Graphical Forecast Creator

Graphical Forecast Creator is an application built to give weather enthusiasts the tools to build forecasts, monitor them, and reflect on their performance.

### Why is GFC so important?

GFC was created to give users an easy way to create forecasts and reflect on and learn about different weather events in a hands-on format where they are in the driver's seat of the forecasts they see almost every day.

Before GFC, users often had to create janky or unstable solutions for this task, such as manually drawing in Microsoft Paint or Photoshop, or using the public version of AWIPS, which is not modern enough for the average consumer. GFC set out to provide a modern solution.

For some users, GFC is a critical learning ground for understanding the atmosphere and predicting its behavior. That is why GFC and its core features should always remain freely available.

### Where is GFC Available?

GFC is available on the web at gfc.weatherboysuper.com and is accessible on any platform with a web browser. It is primarily built for desktop and large-screen users, with some mobile components.

### What can be done in GFC?

GFC currently has four modes, each serving a distinct purpose:
- **Forecast**: This is where the user builds a forecast
- **Discussion**: This is where the user can build a text-based discussion to go along with their forecast
- **Monitor**: Once a user finishes their forecast, they can monitor it while viewing the latest radar, satellite, reports, and alerts.
- **Verification**: This allows the user to view their forecast, reflect on its performance, and find ways to learn and grow

## Message from the creator

GFC is an important product. In a sense, it is my "baby" project and is extremely important to me. It may not have many users, but it leaves an impact on the knowledge and skill growth of the users it does have. It is important that those benefits remain freely available.

This project is also a learning experience for me as a developer. I am a meteorology student, not a computer science student, and I had never built an application used by others before GFC. There will be testing, experimentation, questions, and change. It is important to adapt quickly while keeping me and everyone developing on the project accountable. There may be architecture questions, and it is important to have an opinion and push back when a path is not right. We are not perfect, and we should always put the value of the product and its users first.

## Maintaining the Project

GFC is open source. Keeping the code available to everyone is an intentional decision by the owner. It is a critical learning tool, and the owner cannot always maintain it alone, so leaving it open for others to understand and customize is important.

The rules for maintaining the project change over time. If something seems off, use judgment and ask when needed. Keep building under the principles above, and test solutions with the tools appropriate to the task, including browsers, computer use, or Playwright when the product experience needs to be exercised.

## Project Locations
- `.github/` - GitHub resources
- `docs/` - Documentation
    - `docs/personal/` - A git-ignored directory for local maintainer documents. It may not exist, but it is the place for local plans, one-time documents, and other personal artifacts that should not be committed.
- `server/` - All backend code that runs on the VPS
- `src/`
    - `src/components/` - All the different components used in GFC

Anything else I can trust you to find what you need. The codebase isn't too hard to navigate.

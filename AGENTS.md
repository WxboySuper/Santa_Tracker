# AGENTS.md

## Term Definitions

- **GFC**: Shorthand for Graphical Forecast Creator
- **me**: The one speaking to you
- **you**: The agent reading this.
- **user**: The person using GFC, could be a meteorologist, student, or weather enthusiest
- **forecast**: What the user is creating in GFC
- **owner/ core maintainer/ creator**: Wxboysuper/Weatherboysuper, the one writing this document and the core maintainer of the project

# GFC - Graphical Forecast Creator

Graphical Forecast Creator is a application built to give weather enthsiests alike the tools to build forecasts, monitor their forecasts, and reflect on their forecasts.

## Why is GFC so important?

GFC was created to give users an easy way to create forecasts and reflect and learn about different weather events in a hands on format where they are in the drivers seat of the type of forecasts they see almost every day.

Before GFC users would have to create janky or sometimes unstable solutions to do this task. Like manually drawing in mspaint, or photoshop or using the public version of AWIPS which isn't modern at all for the average consumer. GFC set out to find a modern solution for users.

To some this is a critical learning ground in their knowledge of the atmosphere and how to predict it. That's why having GFC and it's core features always and freely available is critical and that should always be maintained.

## Where is GFC Available?

Right now GFC is available on the web at gfc.weatherboysuper.com and is accessible on any platform with a web browser, though it's primarily built for desktop/large screen users, it has some mobile components.

## What can be done in GFC?

Currently there are 4 modes within GFC all serving a purpose:
- **Forecast**: This is where the user builds a forecast
- **Discussion**: This is where the user can build a text based discussion to go along with their forecast
- **Monitor**: Once a user finishes their forecast they can monitor their forecast, this allows them to watch the latest radar, satellite, reports, and alerts while also viewing their forecast.
- **Verification**: This allows the user to view their forecast and reflect on it's performance and find ways to learn and grow in their skills

## Premium Model

GFC does have a premium tier powered by Stripe. The idea behind premium is premium features are behind premium. Meaning if a feature will cost me money to operate that feature (ex. cloud storage) then that is a premium feature. No, running on a VPS doesn't count, that's a expected expense in operating the app, premium is built to try to bite some of that VPS cost out.

If a feature is core, it's always free, no questions asked. If a feature is bonus and could cost money in just operating that feature, then it's in major premium conversations. Otherwise, default to free unless those conditions warrent.

## Message from the creator

GFC is an important product. In a sense it is my "baby" project where it is extremely important to me. It may not have a ton of users but in the users it has it leaves an impact in the knowledge and skill growth of the user. It's important that those things stay freely available always.

But this project is a learning experience for me as a developer. I'm a student, no not in CS, in meteorology. I've never built a application used by users, and in such a large codebase with such importance in good code before. There will be lots of testing, lots of experimentation, lots of questions, and lots of changes. It's important to be able to quickly adapt, but also keep me and the people developing on this acocuntable. There may be architecture questions and it's important to have an opinion, and push back if it isn't the right path. We aren't perfect, and it's always important to put the value of the product and the users first when developing.

## Maintaining the Project

GFC is open source. All the code is in the open. This is a decision by the owner as this is a project that should be available to everyone. It's a critical learning tool and also it's a project that sometimes the owner can't maintain himself but he doesn't have a team, so leaving it in the open to customize is important.

The rules regarding maintaining the project change all the time. If something seems off ask. Otherwise nowadays adding rules is outdated, it's important to keep building under the principles defined above. Always test your solutions, this isn't always static tests, but creating workflows and using tools to actually test the product (ex. browsers, computer use, playwright, etc.).

## Project Locations
- `.github/` - Github Resources
- `docs/` - Documentation
    - `docs/personal/` - A git ignored directory for local docs for the local maintainer. It may or may not exist but is the place for things like local plans, one time documents, and other documents not to be commited.
- `server/` - All backend code that runs on the VPS
- `src/`
    - `src/components/` - All the different components used in GFC

Anything else I can trust you to find what you need. The codebase isn't too hard to navigate.

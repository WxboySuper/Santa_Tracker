# Product content

`src/content` contains static product content and release-specific data used by
the application, such as update entries. Keep content declarative and separate
from route composition, feature exposure, and domain state.

Update content consumers and focused tests when a content shape changes.

Versioned update entries remain under `src/content/updates/`; the public
`/updates` route points to the current release entry while older versions stay
available as source history.

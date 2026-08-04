# Script libraries

`scripts/lib` contains reusable policy and parsing modules for repository
automation. Root scripts compose these modules and provide the CLI boundary.

Keep modules deterministic and side-effect-light. Put GitHub, filesystem, or
environment access behind explicit functions, and colocate Node tests for
policy changes.

# Outlook Label Information

## Categorical
**This outlook is a prodoct of the 3 probabilitstic outlooks**

The categorical outlook showcases the probabilistic outlooks combined.
Highest Categorical Risk Examples:
Examples of probabilistic to categorical outlook conversions:

**Single Outlooks:**
- Tornado 5% → Slight (2/5)
- Tornado 30# → High (5/5)
- Wind 15% → Slight (2/5)
- Wind 45# → Moderate (4/5)
- Hail 30% → Enhanced (3/5)
- Hail 60# → Moderate (4/5)

**Combined Outlooks:**
- Tornado 2% + Wind 5% → Marginal (1/5)
- Tornado 5% + Wind 15% → Slight (2/5)
- Tornado 10% + Hail 15% → Enhanced (3/5)
- Wind 30% + Hail 30% → Enhanced (3/5)
- Tornado 15# + Wind 45% → Moderate (4/5)
- Wind 60# + Hail 45# → High (5/5)
- Tornado 30# + Wind 30% + Hail 15% → High (5/5)
- Tornado 5% + Wind 45# + Hail 60% → Moderate (4/5)

### Note on Graphical Representation

When creating outlook maps, the probabilistic outlooks (Tornado, Wind, Hail) are translated to their categorical counterparts. Due to the graphical nature of these outlooks:

- Multiple risk levels can appear simultaneously on a single map
- Each color on the probabilistic maps directly correlates to its categorical counterpart
- The highest risk level from any probabilistic outlook determines the categorical risk level for a given area
- The conversion follows the guidelines detailed in the sections above

This visual correlation allows forecasters and users to quickly understand both the specific threats (tornado, wind, hail) and the overall severe weather risk level for any location on the map. 
General Thunderstorm is as the name suggests a general thunderstorm threat and doesn't have any coorilating probabilities. General Thunderstorm threats should be drawn on the categorical outlook manually.
The Significant hatch is a blanket layer but has differing affects on it's underlying color. Not all 10% has to be hatched. The hatch needs to be able to flow between risks and should be displayed on top of the other layers. **

Labels:
- General Thunderstorm (0/5) - #bfe7bc
- Marginal (1/5) - #7dc580
- Slight (2/5) - #f3f67d
- Enhanced (3/5) - #e5c27f
- Moderate (4/5) - #e67f7e
- High (5/5) - #fe7ffe

## Tornado
**Outlook based on a tornado occuring. 10% and greater have a significant (labeled by "#") counterpart for significant tornadoes, it's plotted on a map with a black hatch layer**

Labels:
- 2% - #008b02
- 5% - #89472a
- 10% - #fdc900
    - 10#
- 15% - #fe0000
    - 15#
- 30% - #fe00ff
    - 30#
- 45% - #952ae7
    - 45#
- 60% - #114d8c
    - 60#

- "#" = #000000 hatched

Conversion to Categorical:
- 2% --> Marginal
- 5% --> Slight
- 10% --> Enhanced
- 10# --> Enhanced
- 15% --> Enhanced
- 15# --> Moderate
- 30% --> Moderate
- 30# --> High
- 45% --> High
- 45# --> High
- 60% --> High
- 60# --> High

## Damaging Winds & Large Hail
**Damaging Winds and Large Hail share a color scale but differ in conversion to categorical. 15% and greater have a significant (labeled by "#") counterpart for a significant threat, it's plotted on a map with a black hatch layer**

Color Labels:
- 5% - #894826
- 15% - #ffc703
    - 15#
- 30% - #fd0100
    - 30#
- 45% - #fe00fe
    - 45#
- 60% - #912bee
    - 60#

- "#" = #000000 hatched

Wind Conversion to Categorical:
- 5% --> Marginal
- 15% --> Slight
- 15# --> Slight
- 30% --> Enhanced
- 30# --> Enhanced
- 45% --> Enhanced
- 45# --> Moderate
- 60% --> Moderate
- 60# --> High

Hail Conversion to Categorical: 
- 5% --> Marginal
- 15% --> Slight
- 15# --> Slight
- 30% --> Enhanced
- 30# --> Enhanced
- 45% --> Enhanced
- 45# --> Moderate
- 60% --> Moderate
- 60# --> Moderate
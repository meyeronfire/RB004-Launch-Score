# Passive form verification — unapplied scoring proposal

The redesign preserves all current scoring rules and category weights. A form without an HTML action or visible declarative handler may submit through JavaScript. Its presentation is therefore **Needs review**, while the existing medium-severity finding still deducts 7 conversion category points.

Proposed future change, requiring owner approval and a new scoring version: retain this finding as a verification task but exclude it from deductions until a functional test or other supported evidence confirms a failure. A missing security header remains a confirmed response observation; it must not be described as proof of an exploitable vulnerability.

The regression in `tests/report-interface.test.ts` exercises the existing scorer with the passive form included (93 conversion points at full coverage) and a separate hypothetical eligibility filter (100). This is a tested comparison, not a production scoring change. Historical reports must keep their original scoring version; comparisons would require compatible versions and inputs. No submissions to real forms were made for this redesign.

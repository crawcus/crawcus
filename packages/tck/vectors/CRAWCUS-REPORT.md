# CRAWCUS vectors: report

Each case under hash-chain/ and disclosure-signal/, run through @crawcus/spec.

| Set | Case | Expected | Got | Verdict |
|---|---|---|---|---|
| hash-chain | event-removed | {"valid":false,"brokenAt":2,"check":"prevHash"} | {"valid":false,"brokenAt":2,"check":"prevHash"} | agree |
| hash-chain | events-swapped | {"valid":false,"brokenAt":1,"check":"prevHash"} | {"valid":false,"brokenAt":1,"check":"prevHash"} | agree |
| hash-chain | genesis-prevhash-set | {"valid":false,"brokenAt":0,"check":"genesis"} | {"valid":false,"brokenAt":0,"check":"genesis"} | agree |
| hash-chain | genesis-removed | {"valid":false,"brokenAt":0,"check":"genesis"} | {"valid":false,"brokenAt":0,"check":"genesis"} | agree |
| hash-chain | golden | {"valid":true,"brokenAt":null,"check":null} | {"valid":true,"brokenAt":null,"check":null} | agree |
| hash-chain | payload-edited | {"valid":false,"brokenAt":2,"check":"contentHash"} | {"valid":false,"brokenAt":2,"check":"contentHash"} | agree |
| hash-chain | payload-edited-and-rehashed | {"valid":false,"brokenAt":3,"check":"prevHash"} | {"valid":false,"brokenAt":3,"check":"prevHash"} | agree |
| disclosure-signal | hash-mismatch | false | false | agree |
| disclosure-signal | hash-mismatch-not-required | true | true | agree |
| disclosure-signal | name-lint: userScrollAcknowledgedNoticeBySignal | {"ok":false,"code":"FORBIDDEN_TOKEN","token":"acknowledged","cites":true} | {"ok":false,"code":"FORBIDDEN_TOKEN","token":"acknowledged","cites":true} | agree |
| disclosure-signal | name-lint: userScrollConsentedNoticeBySignal | {"ok":false,"code":"FORBIDDEN_TOKEN","token":"consented","cites":true} | {"ok":false,"code":"FORBIDDEN_TOKEN","token":"consented","cites":true} | agree |
| disclosure-signal | name-lint: userScrollAgreedNoticeBySignal | {"ok":false,"code":"FORBIDDEN_TOKEN","token":"agreed","cites":true} | {"ok":false,"code":"FORBIDDEN_TOKEN","token":"agreed","cites":true} | agree |
| disclosure-signal | name-lint: userScrollConfirmedNoticeBySignal | {"ok":false,"code":"FORBIDDEN_TOKEN","token":"confirmed","cites":true} | {"ok":false,"code":"FORBIDDEN_TOKEN","token":"confirmed","cites":true} | agree |
| disclosure-signal | name-lint: userScrollCONSENTEDNotice | {"ok":false,"code":"FORBIDDEN_TOKEN","token":"consented","cites":true} | {"ok":false,"code":"FORBIDDEN_TOKEN","token":"consented","cites":true} | agree |
| disclosure-signal | name-lint: disclosureWasObserved | {"ok":false,"code":"MISSING_REQUIRED_TOKEN","token":"opportunity \| signal","cites":true} | {"ok":false,"code":"MISSING_REQUIRED_TOKEN","token":"opportunity \| signal","cites":true} | agree |
| disclosure-signal | name-lint: disclosureHasOpportunityToBeRead | {"ok":true} | {"ok":true} | agree |
| disclosure-signal | name-lint: disclosureSignalObserved | {"ok":true} | {"ok":true} | agree |
| disclosure-signal | no-delivery | false | false | agree |
| disclosure-signal | other-requirement | false | false | agree |
| disclosure-signal | other-subject | false | false | agree |
| disclosure-signal | positive | true | true | agree |
| disclosure-signal | redelivered-signal-for-new | true | true | agree |
| disclosure-signal | redelivered-signal-for-old | false | false | agree |
| disclosure-signal | signal-type-not-accepted | false | false | agree |

hash-chain: 7 cases (expected 7); 7 of 7 checks agree.
disclosure-signal: 10 cases (expected 10); 17 of 17 checks agree.
Chains accepted: 1 of 1; broken chains rejected at the expected event and rule: 6 of 6.
Names linted as expected: 8 of 8 (expected 8).

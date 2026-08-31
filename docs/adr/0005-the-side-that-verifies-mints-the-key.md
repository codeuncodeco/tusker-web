# The side that verifies mints the key

Tusker and an org app call each other in both directions, and each direction
carries its own key.

| Direction | Who verifies | The key |
| --- | --- | --- |
| Tusker to org app, for ref options | the org app | the refs key |
| Org app to Tusker, for tasks | Tusker | the org key |

One rule covers both: the side that verifies a key is the side that mints it.
Tusker mints the org key and stores it hashed, because Tusker verifies the task
reads. The org app mints the refs key and stores it hashed, because the org app
verifies the refs reads. Tusker holds the plaintext refs key beside the
reference field it belongs to.

The alternative was for Tusker to mint both keys. That is one screen instead of
N, but it gives Tusker a credential to data it does not own, and it takes
revocation away from the org whose data is at risk. An org could then revoke
only by changing a secret in silence, which breaks the link until somebody
pastes the new value back.

The second alternative removes the shared secret. Tusker signs its calls with a
keypair and publishes a JWKS, and each org app verifies the signature. That
trades a string comparison for JWKS verification in every org app. At two org
apps the cost is larger than the gain. Ask again at five.

## Consequences

Each org app writes its own mint-and-revoke screen. That is N implementations,
one per org app, on top of the refs endpoint each app already writes.

A third org app, run by somebody else, is safe to link. Tusker never holds a
credential that opens data it does not own.

`TUSKER_API_KEY`, the shared Worker secret that gates the blrhikes-app
endpoints today, goes. A Worker secret holds one value and does not survive a
second org app.

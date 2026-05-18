# Phase 0: External Prerequisites [EXTERNAL]

These must be done before deploying. None produce code.

> Back to [index](index.md)

---

## Task 0.1: AWS account prerequisites

- [ ] Install AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
- [ ] Run `aws configure` — enter Access Key ID, Secret, region (e.g. `us-east-1`), output `json`
- [ ] Install CDK: `npm install -g aws-cdk`
- [ ] Bootstrap the account (one-time): `cd infra && npx cdk bootstrap`

---

## Task 0.2: Google OAuth client

- [ ] Open Google Cloud Console → APIs & Services → Credentials
- [ ] Create OAuth 2.0 Client ID (Web application)
- [ ] Authorised redirect URIs: `https://<your-cognito-domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse`
- [ ] Note the **Client ID** and **Client Secret** — needed after CDK deploy (Task 6.2)

---

## Task 0.3: Apple Sign In (optional — skip if deferring Apple)

- [ ] Apple Developer Portal → Certificates, IDs & Profiles → Services IDs
- [ ] Create a new Services ID; enable Sign In with Apple
- [ ] Configure return URL: `https://<cognito-domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse`
- [ ] Create a Key (type: Sign In with Apple); download the `.p8` file
- [ ] Note: Team ID, Services ID, Key ID, `.p8` contents — needed at Task 6.2

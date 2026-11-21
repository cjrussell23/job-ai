# Discord messages

After each daily run, members who connected Discord get a direct message listing their new matches that score at or above their threshold. Each match is sent once.

## Set up the bot (admin, once)

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and choose **New Application** (name it "Job Search").
2. Under **Bot**, choose **Reset Token** and copy the token. Set it as `DISCORD_BOT_TOKEN` in the `job-ai` stack's environment variables in Portainer, then redeploy. The bot needs no privileged intents.
3. Under **OAuth2 → URL Generator**, tick the `bot` scope (no permissions are needed), open the generated link, and add the bot to a server you and the members share.

A bot can only message people who share a server with it and allow direct messages from that server's members.

## Connect a member

Each member enters their Discord user ID on their account page (Discord → Settings → Advanced → Developer Mode, then click their own name → Copy User ID). Saving sends a test message, which confirms the setup end to end.

If `DISCORD_BOT_TOKEN` is empty, nothing is sent and runs carry on as normal.

import Eris from "eris";
import dotenv from "dotenv";

dotenv.config();

// Bot with guilds intent (slash commands don’t need messageContent)
const bot = new Eris(process.env.TOKEN, {
  intents: ["guilds"]
});

// Register commands when ready
bot.on("ready", async () => {
  console.log(`✅ Logged in as ${bot.user.username}`);

  const guildID = "YOUR_GUILD_ID"; // Replace with your server ID

  // Register slash commands in your server
  await bot.bulkEditGuildCommands(guildID, [
    {
      name: "ping",
      description: "Replies with Pong!"
    },
    {
      name: "server",
      description: "Shows server info"
    },
    {
      name: "userinfo",
      description: "Shows info about a user",
      options: [
        {
          type: 6, // USER type
          name: "target",
          description: "Select a user",
          required: false
        }
      ]
    }
  ]);
});

// Handle interactions
bot.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand) return;

  const { name, data } = interaction;

  if (name === "ping") {
    await bot.createMessage(interaction.channel.id, "🏓 Pong!");
  }

  else if (name === "server") {
    const guild = interaction.guild;
    await bot.createMessage(
      interaction.channel.id,
      `Server: **${guild.name}**\nMembers: **${guild.memberCount}**`
    );
  }

  else if (name === "userinfo") {
    const member = data.options?.[0]?.value
      ? await bot.getRESTUser(data.options[0].value)
      : interaction.member.user;

    await bot.createMessage(
      interaction.channel.id,
      `User: **${member.username}#${member.discriminator}**\nID: **${member.id}**`
    );
  }
});

bot.connect();

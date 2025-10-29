import Eris from "eris";
import dotenv from "dotenv";

dotenv.config();

// Create bot with guilds intent only (slash commands don’t need messageContent)
const bot = new Eris(process.env.TOKEN, {
  intents: ["guilds"]
});

// Your server ID
const guildID = "1417014862273445900";

// Register slash commands when bot is ready
bot.on("ready", async () => {
  console.log(`✅ Logged in as ${bot.user.username}`);

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

  console.log("✅ Slash commands registered");
});

// Handle slash commands
bot.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand) return;

  const { name, data } = interaction;

  if (name === "ping") {
    await interaction.createMessage("🏓 Pong!");
  } 

  else if (name === "server") {
    const guild = interaction.guild;
    await interaction.createMessage(
      `Server: **${guild.name}**\nMembers: **${guild.memberCount}**`
    );
  } 

  else if (name === "userinfo") {
    const member = data.options?.[0]?.value
      ? await bot.getRESTUser(data.options[0].value)
      : interaction.member.user;

    await interaction.createMessage(
      `User: **${member.username}#${member.discriminator}**\nID: **${member.id}**`
    );
  }
});

// Connect the bot
bot.connect();

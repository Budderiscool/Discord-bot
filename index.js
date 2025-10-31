import { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import express from 'express';
import https from 'https';

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = "1417014862273445900";
const CHANNEL_ID = "1431127498903078";
const MODRINTH_PROJECT_ID = "qWl7Ylv2";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rest = new REST({ version: '10' }).setToken(TOKEN);

// ---- Register Commands ----
const commands = [
  {
    name: "modrinthtest",
    description: "Fetch and send the latest Modrinth project info"
  },
  {
    name: "settings",
    description: "Customize the Modrinth embed settings"
  }
];

// ---- Clear old commands + sync new ones ----
async function syncCommands() {
  try {
    console.log("Clearing old commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
    console.log("Registering new commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("Slash commands registered!");
  } catch (err) {
    console.error("Error syncing commands:", err);
  }
}

// ---- Modrinth fetch using HTTPS (no fetch required) ----
function fetchModrinthData() {
  return new Promise((resolve, reject) => {
    https.get(`https://api.modrinth.com/v2/project/${MODRINTH_PROJECT_ID}`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', err => reject(err));
  });
}

// ---- Express keep-alive for Koyeb ----
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.send('Bot is running'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ---- Bot ready ----
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await syncCommands();
});

// ---- Handle Commands ----
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // ---- /modrinthtest ----
  if (commandName === "modrinthtest") {
    await interaction.deferReply();
    try {
      const data = await fetchModrinthData();
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(data.title)
        .setURL(`https://modrinth.com/project/${data.slug}`)
        .setDescription(data.description)
        .setThumbnail(data.icon_url)
        .addFields(
          { name: "Author", value: data.team[0]?.user?.username || "Unknown" },
          { name: "Followers", value: data.followers.toString(), inline: true },
          { name: "Downloads", value: data.downloads.toString(), inline: true },
          { name: "Updated", value: `<t:${Math.floor(new Date(data.updated).getTime() / 1000)}:R>` }
        )
        .setFooter({ text: "Fetched live from Modrinth" });
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      await interaction.editReply("⚠️ Failed to fetch Modrinth data.");
    }
  }

  // ---- /settings ----
  if (commandName === "settings") {
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle("🛠 Embed Settings")
      .setDescription("Choose what to customize below:")
      .setFooter({ text: "Settings Menu" });

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("set_color")
        .setLabel("Change Color")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("set_image")
        .setLabel("Change Image")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("set_footer")
        .setLabel("Change Footer")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("close_settings")
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ embeds: [embed], components: [buttons] });
  }
});

// ---- Button interactions ----
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  switch (interaction.customId) {
    case "set_color":
      await interaction.update({ content: "🎨 Color editing coming soon!", components: [], embeds: [] });
      break;
    case "set_image":
      await interaction.update({ content: "🖼 Image editing coming soon!", components: [], embeds: [] });
      break;
    case "set_footer":
      await interaction.update({ content: "📝 Footer editing coming soon!", components: [], embeds: [] });
      break;
    case "close_settings":
      await interaction.update({ content: "Settings closed.", components: [], embeds: [] });
      break;
  }
});

client.login(TOKEN);

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
import fs from 'fs';

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = "1417014862273445900";
const SETTINGS_FILE = "./settings.json";

// Load or create default settings
function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return { color: "#00FF00", image: null, footer: "Static Modrinth Preview" };
  }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rest = new REST({ version: '10' }).setToken(TOKEN);

// ---- Commands ----
const commands = [
  { name: "settings", description: "Customize the Modrinth embed settings" },
  { name: "modrinthtest", description: "Preview a static Modrinth embed" }
];

// ---- Clear old commands + sync ----
async function syncCommands() {
  try {
    console.log("Clearing old commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
    console.log("Registering new commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Slash commands registered!");
  } catch (err) {
    console.error("Error syncing commands:", err);
  }
}

// ---- Express keep-alive for Render ----
const app = express();
app.get('/', (_, res) => res.send('Bot is running'));
app.listen(3000, () => console.log("✅ Web server running on port 3000 for Render"));

// ---- Ready ----
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await syncCommands();
});

// ---- Handle Slash Commands ----
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const settings = loadSettings();

  if (interaction.commandName === "settings") {
    const embed = new EmbedBuilder()
      .setTitle("🛠 Embed Settings")
      .setDescription(`Current Settings:\n**Color:** ${settings.color}\n**Image:** ${settings.image || "None"}\n**Footer:** ${settings.footer}`)
      .setColor(settings.color)
      .setFooter({ text: settings.footer });
    if (settings.image) embed.setThumbnail(settings.image);

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("set_color").setLabel("Change Color").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("set_image").setLabel("Change Image").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("set_footer").setLabel("Change Footer").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("test_preview").setLabel("Test Modrinth").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("close").setLabel("Close").setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
  }

  if (interaction.commandName === "modrinthtest") {
    const embed = new EmbedBuilder()
      .setTitle("Example Modrinth Project")
      .setURL("https://modrinth.com/project/qWl7Ylv2")
      .setDescription("This is a static preview of the Modrinth project. No live API call is made.")
      .setColor(settings.color)
      .addFields(
        { name: "Author", value: "ExampleAuthor", inline: true },
        { name: "Version", value: "1.0.0", inline: true },
        { name: "Downloads", value: "1234", inline: true }
      )
      .setFooter({ text: settings.footer });
    if (settings.image) embed.setThumbnail(settings.image);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

// ---- Handle Buttons ----
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const settings = loadSettings();
  const embed = EmbedBuilder.from(interaction.message.embeds[0] || new EmbedBuilder());

  switch (interaction.customId) {
    case "set_color":
      settings.color = settings.color === "#00FF00" ? "#00BFFF" : settings.color === "#00BFFF" ? "#FF8800" : "#00FF00";
      embed.setColor(settings.color);
      break;
    case "set_image":
      settings.image = settings.image ? null : "https://i.imgur.com/your-image.png";
      if (settings.image) embed.setThumbnail(settings.image); else embed.setThumbnail(null);
      break;
    case "set_footer":
      settings.footer = settings.footer === "Static Modrinth Preview" ? "Custom Footer Example" : "Static Modrinth Preview";
      embed.setFooter({ text: settings.footer });
      break;
    case "test_preview":
      const preview = new EmbedBuilder()
        .setTitle("Example Modrinth Project")
        .setURL("https://modrinth.com/project/qWl7Ylv2")
        .setDescription("This is a static preview of the Modrinth project. No live API call is made.")
        .setColor(settings.color)
        .addFields(
          { name: "Author", value: "ExampleAuthor", inline: true },
          { name: "Version", value: "1.0.0", inline: true },
          { name: "Downloads", value: "1234", inline: true }
        )
        .setFooter({ text: settings.footer });
      if (settings.image) preview.setThumbnail(settings.image);
      return interaction.reply({ embeds: [preview], ephemeral: true });
    case "close":
      return interaction.update({ content: "Settings closed.", embeds: [], components: [] });
  }

  saveSettings(settings);
  await interaction.update({ embeds: [embed], components: interaction.message.components });
});

client.login(TOKEN);

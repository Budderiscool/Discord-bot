const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const express = require('express');
const fs = require('fs');

// ====== CONFIG ======
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = "1417014862273445900";
const MODRINTH_PROJECT_ID = "qWl7Ylv2";
const SETTINGS_FILE = "./settings.json";

// ====== SETTINGS STORAGE ======
function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return { color: "#00ff88", showCreator: true, showIcon: true };
  }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// ====== CLIENT INIT ======
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// ====== SLASH COMMANDS ======
const commands = [
  new SlashCommandBuilder()
    .setName("modrinth-test")
    .setDescription("Fetch and preview the latest Modrinth project data."),
  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Configure bot display settings for Modrinth embeds."),
];

// ====== SYNC COMMANDS ======
async function syncCommands() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  try {
    console.log("🔄 Clearing all previous slash commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
    console.log("✅ Old commands cleared.");
    console.log("🚀 Registering new commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Commands registered!");
  } catch (err) {
    console.error("❌ Error syncing commands:", err);
  }
}

// ====== MODRINTH FETCH ======
async function fetchModrinthProject() {
  const res = await fetch(`https://api.modrinth.com/v2/project/${MODRINTH_PROJECT_ID}`);
  if (!res.ok) throw new Error("Failed to fetch Modrinth project.");
  return await res.json();
}

async function fetchModrinthVersions() {
  const res = await fetch(`https://api.modrinth.com/v2/project/${MODRINTH_PROJECT_ID}/version`);
  if (!res.ok) throw new Error("Failed to fetch Modrinth versions.");
  return await res.json();
}

// ====== EMBED BUILDER ======
function buildModrinthEmbed(project, versions, settings) {
  const latest = versions[0];
  const embed = new EmbedBuilder()
    .setTitle(project.title)
    .setURL(`https://modrinth.com/project/${project.slug}`)
    .setDescription(latest.changelog?.slice(0, 1024) || "No changelog provided.")
    .setColor(settings.color || "#00ff88")
    .addFields(
      { name: "Version", value: latest.name || "Unknown", inline: true },
      { name: "Downloads", value: project.downloads.toString(), inline: true },
      { name: "Followers", value: project.followers.toString(), inline: true }
    )
    .setTimestamp(new Date(latest.date_published));

  if (settings.showIcon && project.icon_url) embed.setThumbnail(project.icon_url);
  if (settings.showCreator && project.author) embed.setFooter({ text: `By ${project.author}` });

  return embed;
}

// ====== INTERACTION HANDLERS ======
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await syncCommands();
});

// ====== COMMAND LOGIC ======
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const settings = loadSettings();

  if (interaction.commandName === "modrinth-test") {
    await interaction.reply("⏳ Fetching latest Modrinth project data...");
    try {
      const project = await fetchModrinthProject();
      const versions = await fetchModrinthVersions();
      const embed = buildModrinthEmbed(project, versions, settings);
      await interaction.editReply({ content: "", embeds: [embed] });
    } catch (err) {
      console.error(err);
      await interaction.editReply("❌ Failed to fetch Modrinth data.");
    }
  }

  if (interaction.commandName === "settings") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("toggle_icon")
        .setLabel(settings.showIcon ? "🟢 Hide Icon" : "⚪ Show Icon")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("toggle_creator")
        .setLabel(settings.showCreator ? "🟢 Hide Creator" : "⚪ Show Creator")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("change_color")
        .setLabel("🎨 Change Color")
        .setStyle(ButtonStyle.Primary)
    );

    const preview = new EmbedBuilder()
      .setTitle("⚙️ Settings Panel")
      .setDescription(
        `Adjust how Modrinth embeds look.\n\n**Current Settings:**\nColor: ${settings.color}\nShow Icon: ${settings.showIcon}\nShow Creator: ${settings.showCreator}`
      )
      .setColor(settings.color);

    await interaction.reply({
      embeds: [preview],
      components: [row],
      ephemeral: true,
    });
  }
});

// ====== BUTTON HANDLING ======
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  const settings = loadSettings();

  if (interaction.customId === "toggle_icon") {
    settings.showIcon = !settings.showIcon;
  } else if (interaction.customId === "toggle_creator") {
    settings.showCreator = !settings.showCreator;
  } else if (interaction.customId === "change_color") {
    const newColor =
      settings.color === "#00ff88"
        ? "#00bfff"
        : settings.color === "#00bfff"
        ? "#ff8800"
        : "#00ff88";
    settings.color = newColor;
  }

  saveSettings(settings);

  const updatedEmbed = new EmbedBuilder()
    .setTitle("✅ Settings Updated")
    .setDescription(
      `**Color:** ${settings.color}\n**Show Icon:** ${settings.showIcon}\n**Show Creator:** ${settings.showCreator}`
    )
    .setColor(settings.color);

  await interaction.update({ embeds: [updatedEmbed] });
});

// ====== KEEP ALIVE (RENDER FIX) ======
const app = express();
app.get("/", (req, res) => res.send("Bot is running fine!"));
app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Web server active — Render won't time out.");
});

// ====== START BOT ======
client.login(DISCORD_TOKEN);

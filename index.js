import Eris from "eris";
import dotenv from "dotenv";

dotenv.config();

const bot = new Eris(process.env.TOKEN, {
  intents: ["guilds", "guildMessages", "directMessages", "messageContent"]
});

bot.on("ready", () => {
  console.log(`✅ Logged in as ${bot.user.username}`);
});

bot.on("messageCreate", (msg) => {
  if (msg.author.bot) return; // ignore other bots
  if (msg.content === "!ping") {
    bot.createMessage(msg.channel.id, "Pong!");
  }
});

bot.connect();

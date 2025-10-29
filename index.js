import Eris from "eris";
import dotenv from "dotenv";

dotenv.config();

const bot = new Eris.Client(process.env.TOKEN);

bot.on("ready", () => {
  console.log(`✅ Logged in as ${bot.user.username}`);
});

bot.on("messageCreate", (msg) => {
  if (msg.author.bot) return;
  if (msg.content === "!ping") {
    bot.createMessage(msg.channel.id, "Pong!");
  }
});

bot.connect();

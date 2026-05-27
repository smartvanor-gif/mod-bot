const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require("discord.js");
const http = require("http");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const PREFIX = "!";

// Register /say slash command
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("say")
      .setDescription("Send a custom embed message")
      .addStringOption(option =>
        option.setName("title").setDescription("Title of the embed").setRequired(true)
      )
      .addStringOption(option =>
        option.setName("text").setDescription("Text content of the embed").setRequired(true)
      )
      .addStringOption(option =>
        option.setName("color")
          .setDescription("Hex color (e.g. ff0000 for red). Default: purple")
          .setRequired(false)
      )
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered");
  } catch (err) {
    console.error("❌ Failed to register slash commands:", err);
  }
});

// Handle /say
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "say") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });

    const title = interaction.options.getString("title");
    const text = interaction.options.getString("text");
    const colorInput = interaction.options.getString("color") || "5865f2";
    const color = parseInt(colorInput.replace("#", ""), 16);

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(text)
      .setColor(isNaN(color) ? 0x5865f2 : color);

    await interaction.reply({ content: "✅ Sent!", ephemeral: true });
    await interaction.channel.send({ embeds: [embed] });
  }
});

// Prefix commands
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const hasPermission = (perm) => message.member.permissions.has(perm);

  if (command === "kick") {
    if (!hasPermission(PermissionsBitField.Flags.KickMembers))
      return message.reply("❌ You don't have permission to kick members.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Please mention a user to kick.");
    const reason = args.slice(1).join(" ") || "No reason provided";
    try {
      await target.kick(reason);
      const embed = new EmbedBuilder()
        .setColor(0xff9900).setTitle("👢 Member Kicked")
        .addFields(
          { name: "User", value: `${target.user.tag}`, inline: true },
          { name: "By", value: `${message.author.tag}`, inline: true },
          { name: "Reason", value: reason }
        ).setTimestamp();
      message.channel.send({ embeds: [embed] });
    } catch (err) { message.reply(`❌ Failed to kick: ${err.message}`); }
  }

  else if (command === "ban") {
    if (!hasPermission(PermissionsBitField.Flags.BanMembers))
      return message.reply("❌ You don't have permission to ban members.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Please mention a user to ban.");
    const reason = args.slice(1).join(" ") || "No reason provided";
    try {
      await target.ban({ reason });
      const embed = new EmbedBuilder()
        .setColor(0xff0000).setTitle("🔨 Member Banned")
        .addFields(
          { name: "User", value: `${target.user.tag}`, inline: true },
          { name: "By", value: `${message.author.tag}`, inline: true },
          { name: "Reason", value: reason }
        ).setTimestamp();
      message.channel.send({ embeds: [embed] });
    } catch (err) { message.reply(`❌ Failed to ban: ${err.message}`); }
  }

  else if (command === "unban") {
    if (!hasPermission(PermissionsBitField.Flags.BanMembers))
      return message.reply("❌ You don't have permission to unban members.");
    const userId = args[0];
    if (!userId) return message.reply("❌ Please provide a user ID to unban.");
    try {
      await message.guild.members.unban(userId);
      message.reply(`✅ Unbanned user with ID \`${userId}\`.`);
    } catch (err) { message.reply(`❌ Failed to unban: ${err.message}`); }
  }

  else if (command === "mute") {
    if (!hasPermission(PermissionsBitField.Flags.ModerateMembers))
      return message.reply("❌ You don't have permission to mute members.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Please mention a user to mute.");
    const minutes = parseInt(args[1]) || 10;
    const reason = args.slice(2).join(" ") || "No reason provided";
    const duration = minutes * 60 * 1000;
    try {
      await target.timeout(duration, reason);
      const embed = new EmbedBuilder()
        .setColor(0xffcc00).setTitle("🔇 Member Muted")
        .addFields(
          { name: "User", value: `${target.user.tag}`, inline: true },
          { name: "Duration", value: `${minutes} minute(s)`, inline: true },
          { name: "By", value: `${message.author.tag}`, inline: true },
          { name: "Reason", value: reason }
        ).setTimestamp();
      message.channel.send({ embeds: [embed] });
    } catch (err) { message.reply(`❌ Failed to mute: ${err.message}`); }
  }

  else if (command === "unmute") {
    if (!hasPermission(PermissionsBitField.Flags.ModerateMembers))
      return message.reply("❌ You don't have permission to unmute members.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Please mention a user to unmute.");
    try {
      await target.timeout(null);
      message.reply(`✅ Unmuted ${target.user.tag}.`);
    } catch (err) { message.reply(`❌ Failed to unmute: ${err.message}`); }
  }

  else if (command === "purge") {
    if (!hasPermission(PermissionsBitField.Flags.ManageMessages))
      return message.reply("❌ You don't have permission to delete messages.");
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100)
      return message.reply("❌ Please provide a number between 1 and 100.");
    try {
      await message.channel.bulkDelete(amount + 1, true);
      const confirm = await message.channel.send(`✅ Deleted ${amount} message(s).`);
      setTimeout(() => confirm.delete().catch(() => {}), 3000);
    } catch (err) { message.reply(`❌ Failed to purge: ${err.message}`); }
  }

  else if (command === "warn") {
    if (!hasPermission(PermissionsBitField.Flags.ModerateMembers))
      return message.reply("❌ You don't have permission to warn members.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Please mention a user to warn.");
    const reason = args.slice(1).join(" ") || "No reason provided";
    const embed = new EmbedBuilder()
      .setColor(0xffa500).setTitle("⚠️ Member Warned")
      .addFields(
        { name: "User", value: `${target.user.tag}`, inline: true },
        { name: "By", value: `${message.author.tag}`, inline: true },
        { name: "Reason", value: reason }
      ).setTimestamp();
    message.channel.send({ embeds: [embed] });
    target.send(`⚠️ You have been warned in **${message.guild.name}** for: ${reason}`).catch(() => {});
  }

  else if (command === "help") {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2).setTitle("🛡️ Moderation Bot Commands")
      .setDescription("Prefix: `!`")
      .addFields(
        { name: "`!kick @user [reason]`", value: "Kick a member" },
        { name: "`!ban @user [reason]`", value: "Ban a member" },
        { name: "`!unban <userID>`", value: "Unban a member by ID" },
        { name: "`!mute @user [minutes] [reason]`", value: "Timeout a member (default: 10 min)" },
        { name: "`!warn @user [reason]`", value: "Warn a member (also DMs them)" },
        { name: "`!unmute @user`", value: "Unmute (remove timeout) a member" },
        { name: "`!purge <1-100>`", value: "Bulk delete messages" },
        { name: "`/say`", value: "Send a custom embed message" }
      )
      .setFooter({ text: "Only usable by members with the right permissions" });
    message.channel.send({ embeds: [embed] });
  }
});

// Keep-alive web server for UptimeRobot
http.createServer((req, res) => res.end("alive")).listen(3000, () => {
  console.log("🌐 Keep-alive server running on port 3000");
});

client.login(process.env.TOKEN);

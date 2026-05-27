const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const PREFIX = "!";

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // Helper: check if executor has permission
  const hasPermission = (perm) => message.member.permissions.has(perm);

  // !kick @user [reason]
  if (command === "kick") {
    if (!hasPermission(PermissionsBitField.Flags.KickMembers))
      return message.reply("❌ You don't have permission to kick members.");

    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Please mention a user to kick.");

    const reason = args.slice(1).join(" ") || "No reason provided";

    try {
      await target.kick(reason);
      const embed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle("👢 Member Kicked")
        .addFields(
          { name: "User", value: `${target.user.tag}`, inline: true },
          { name: "By", value: `${message.author.tag}`, inline: true },
          { name: "Reason", value: reason }
        )
        .setTimestamp();
      message.channel.send({ embeds: [embed] });
    } catch (err) {
      message.reply(`❌ Failed to kick: ${err.message}`);
    }
  }

  // !ban @user [reason]
  else if (command === "ban") {
    if (!hasPermission(PermissionsBitField.Flags.BanMembers))
      return message.reply("❌ You don't have permission to ban members.");

    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Please mention a user to ban.");

    const reason = args.slice(1).join(" ") || "No reason provided";

    try {
      await target.ban({ reason });
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("🔨 Member Banned")
        .addFields(
          { name: "User", value: `${target.user.tag}`, inline: true },
          { name: "By", value: `${message.author.tag}`, inline: true },
          { name: "Reason", value: reason }
        )
        .setTimestamp();
      message.channel.send({ embeds: [embed] });
    } catch (err) {
      message.reply(`❌ Failed to ban: ${err.message}`);
    }
  }

  // !unban <userID>
  else if (command === "unban") {
    if (!hasPermission(PermissionsBitField.Flags.BanMembers))
      return message.reply("❌ You don't have permission to unban members.");

    const userId = args[0];
    if (!userId) return message.reply("❌ Please provide a user ID to unban.");

    try {
      await message.guild.members.unban(userId);
      message.reply(`✅ Unbanned user with ID \`${userId}\`.`);
    } catch (err) {
      message.reply(`❌ Failed to unban: ${err.message}`);
    }
  }

  // !mute @user [duration in minutes] [reason]
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
        .setColor(0xffcc00)
        .setTitle("🔇 Member Muted")
        .addFields(
          { name: "User", value: `${target.user.tag}`, inline: true },
          { name: "Duration", value: `${minutes} minute(s)`, inline: true },
          { name: "By", value: `${message.author.tag}`, inline: true },
          { name: "Reason", value: reason }
        )
        .setTimestamp();
      message.channel.send({ embeds: [embed] });
    } catch (err) {
      message.reply(`❌ Failed to mute: ${err.message}`);
    }
  }

  // !purge <amount>
  else if (command === "purge") {
    if (!hasPermission(PermissionsBitField.Flags.ManageMessages))
      return message.reply("❌ You don't have permission to delete messages.");

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100)
      return message.reply("❌ Please provide a number between 1 and 100.");

    try {
      await message.channel.bulkDelete(amount + 1, true); // +1 to include the command message
      const confirm = await message.channel.send(`✅ Deleted ${amount} message(s).`);
      setTimeout(() => confirm.delete().catch(() => {}), 3000);
    } catch (err) {
      message.reply(`❌ Failed to purge: ${err.message}`);
    }
  }

  // !warn @user [reason]
  else if (command === "warn") {
    if (!hasPermission(PermissionsBitField.Flags.ModerateMembers))
      return message.reply("❌ You don't have permission to warn members.");

    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Please mention a user to warn.");

    const reason = args.slice(1).join(" ") || "No reason provided";

    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle("⚠️ Member Warned")
      .addFields(
        { name: "User", value: `${target.user.tag}`, inline: true },
        { name: "By", value: `${message.author.tag}`, inline: true },
        { name: "Reason", value: reason }
      )
      .setTimestamp();

    message.channel.send({ embeds: [embed] });

    // DM the warned user
    target.send(`⚠️ You have been warned in **${message.guild.name}** for: ${reason}`).catch(() => {});
  }

  // !help
  else if (command === "help") {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🛡️ Moderation Bot Commands")
      .setDescription("Prefix: `!`")
      .addFields(
        { name: "`!kick @user [reason]`", value: "Kick a member" },
        { name: "`!ban @user [reason]`", value: "Ban a member" },
        { name: "`!unban <userID>`", value: "Unban a member by ID" },
        { name: "`!mute @user [minutes] [reason]`", value: "Timeout a member (default: 10 min)" },
        { name: "`!warn @user [reason]`", value: "Warn a member (also DMs them)" },
        { name: "`!purge <1-100>`", value: "Bulk delete messages" }
      )
      .setFooter({ text: "Only usable by members with the right permissions" });

    message.channel.send({ embeds: [embed] });
  }
});

client.login(process.env.TOKEN);

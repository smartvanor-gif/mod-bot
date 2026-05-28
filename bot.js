const {
  Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder,
  REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ChannelType
} = require("discord.js");
const http = require("http");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

const PREFIX = "!";

// ── In-memory storage ──────────────────────────────────────────────
const xpData = {};
const giveaways = {};
const warnings = {};
const configSessions = {};

// ── Slash commands ─────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName("say")
      .setDescription("Send a custom embed")
      .addStringOption(o => o.setName("title").setDescription("Embed title").setRequired(true))
      .addStringOption(o => o.setName("text").setDescription("Embed text").setRequired(true))
      .addStringOption(o => o.setName("color").setDescription("Hex color e.g. ff0000").setRequired(false)),

    new SlashCommandBuilder().setName("giveaway")
      .setDescription("Start a giveaway")
      .addStringOption(o => o.setName("prize").setDescription("What are you giving away?").setRequired(true))
      .addIntegerOption(o => o.setName("minutes").setDescription("Duration in minutes").setRequired(true)),

    new SlashCommandBuilder().setName("rank")
      .setDescription("Check your XP rank"),

    new SlashCommandBuilder().setName("8ball")
      .setDescription("Ask the magic 8ball a question")
      .addStringOption(o => o.setName("question").setDescription("Your question").setRequired(true)),

    new SlashCommandBuilder().setName("coinflip")
      .setDescription("Flip a coin"),

    new SlashCommandBuilder().setName("roll")
      .setDescription("Roll a dice")
      .addIntegerOption(o => o.setName("sides").setDescription("Number of sides (default 6)").setRequired(false)),

    new SlashCommandBuilder().setName("serverinfo")
      .setDescription("Show server information"),

    new SlashCommandBuilder().setName("userinfo")
      .setDescription("Show user information")
      .addUserOption(o => o.setName("user").setDescription("User to look up").setRequired(false)),

    new SlashCommandBuilder().setName("warnings")
      .setDescription("Check warnings for a user")
      .addUserOption(o => o.setName("user").setDescription("User to check").setRequired(true)),

    new SlashCommandBuilder().setName("configure")
      .setDescription("Set up a ticket panel in this channel (Admin only)"),
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands registered");
  } catch (err) { console.error("❌ Slash command error:", err); }

  // Giveaway tick
  setInterval(() => {
    const now = Date.now();
    for (const [msgId, gw] of Object.entries(giveaways)) {
      if (now >= gw.endsAt && !gw.ended) { gw.ended = true; endGiveaway(msgId, gw); }
    }
  }, 10000);
});

// ── XP helpers ─────────────────────────────────────────────────────
function getXP(userId) {
  if (!xpData[userId]) xpData[userId] = { xp: 0, level: 1 };
  return xpData[userId];
}
function addXP(userId, amount) {
  const data = getXP(userId);
  data.xp += amount;
  const needed = data.level * 100;
  if (data.xp >= needed) { data.xp -= needed; data.level++; return true; }
  return false;
}

// ── Welcome + Auto-role ────────────────────────────────────────────
client.on("guildMemberAdd", async (member) => {
  const wCh = member.guild.channels.cache.find(c => c.name === "welcome");
  if (wCh) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2).setTitle("👋 Welcome!")
      .setDescription(`Welcome to **${member.guild.name}**, ${member}! We're glad to have you.`)
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: `Member #${member.guild.memberCount}` })
      .setTimestamp();
    wCh.send({ embeds: [embed] });
  }
  const role = member.guild.roles.cache.find(r => r.name === "Member");
  if (role) member.roles.add(role).catch(() => {});
});

// ── Prefix commands + XP ───────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // XP
  const leveled = addXP(message.author.id, Math.floor(Math.random() * 5) + 1);
  if (leveled) {
    const data = getXP(message.author.id);
    message.channel.send(`🎉 Congrats ${message.author}! You reached **Level ${data.level}**!`);
  }

  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const hasPerm = (perm) => message.member.permissions.has(perm);

  // !kick
  if (command === "kick") {
    if (!hasPerm(PermissionsBitField.Flags.KickMembers)) return message.reply("❌ No permission.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Mention a user.");
    const reason = args.slice(1).join(" ") || "No reason provided";
    try { await target.kick(reason); message.channel.send({ embeds: [modEmbed("👢 Kicked", target, message.author, reason, 0xff9900)] }); }
    catch (e) { message.reply(`❌ ${e.message}`); }
  }

  // !ban
  else if (command === "ban") {
    if (!hasPerm(PermissionsBitField.Flags.BanMembers)) return message.reply("❌ No permission.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Mention a user.");
    const reason = args.slice(1).join(" ") || "No reason provided";
    try { await target.ban({ reason }); message.channel.send({ embeds: [modEmbed("🔨 Banned", target, message.author, reason, 0xff0000)] }); }
    catch (e) { message.reply(`❌ ${e.message}`); }
  }

  // !unban
  else if (command === "unban") {
    if (!hasPerm(PermissionsBitField.Flags.BanMembers)) return message.reply("❌ No permission.");
    const userId = args[0];
    if (!userId) return message.reply("❌ Provide a user ID.");
    try { await message.guild.members.unban(userId); message.reply(`✅ Unbanned \`${userId}\`.`); }
    catch (e) { message.reply(`❌ ${e.message}`); }
  }

  // !mute
  else if (command === "mute") {
    if (!hasPerm(PermissionsBitField.Flags.ModerateMembers)) return message.reply("❌ No permission.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Mention a user.");
    const minutes = parseInt(args[1]) || 10;
    const reason = args.slice(2).join(" ") || "No reason provided";
    try { await target.timeout(minutes * 60 * 1000, reason); message.channel.send({ embeds: [modEmbed(`🔇 Muted (${minutes}m)`, target, message.author, reason, 0xffcc00)] }); }
    catch (e) { message.reply(`❌ ${e.message}`); }
  }

  // !unmute
  else if (command === "unmute") {
    if (!hasPerm(PermissionsBitField.Flags.ModerateMembers)) return message.reply("❌ No permission.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Mention a user.");
    try { await target.timeout(null); message.reply(`✅ Unmuted ${target.user.tag}.`); }
    catch (e) { message.reply(`❌ ${e.message}`); }
  }

  // !warn
  else if (command === "warn") {
    if (!hasPerm(PermissionsBitField.Flags.ModerateMembers)) return message.reply("❌ No permission.");
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Mention a user.");
    const reason = args.slice(1).join(" ") || "No reason provided";
    if (!warnings[message.guild.id]) warnings[message.guild.id] = {};
    if (!warnings[message.guild.id][target.id]) warnings[message.guild.id][target.id] = [];
    warnings[message.guild.id][target.id].push(reason);
    message.channel.send({ embeds: [modEmbed("⚠️ Warned", target, message.author, reason, 0xffa500)] });
    target.send(`⚠️ You were warned in **${message.guild.name}** for: ${reason}`).catch(() => {});
  }

  // !purge
  else if (command === "purge") {
    if (!hasPerm(PermissionsBitField.Flags.ManageMessages)) return message.reply("❌ No permission.");
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100) return message.reply("❌ Number between 1-100.");
    try {
      await message.channel.bulkDelete(amount + 1, true);
      const m = await message.channel.send(`✅ Deleted ${amount} messages.`);
      setTimeout(() => m.delete().catch(() => {}), 3000);
    } catch (e) { message.reply(`❌ ${e.message}`); }
  }

  // !help
  else if (command === "help") {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2).setTitle("📖 Sheriff Bear Commands")
      .addFields(
        { name: "🛡️ Moderation", value: "`!kick` `!ban` `!unban` `!mute` `!unmute` `!warn` `!purge`" },
        { name: "🎉 Giveaway", value: "`/giveaway` — Start a giveaway, react 🎉 to enter" },
        { name: "🎫 Tickets", value: "`/configure` — Set up a ticket panel (Admin)" },
        { name: "⭐ Leveling", value: "`/rank` — Check your XP and level" },
        { name: "🎮 Fun", value: "`/8ball` `/coinflip` `/roll`" },
        { name: "ℹ️ Info", value: "`/serverinfo` `/userinfo` `/warnings`" },
        { name: "📢 Embeds", value: "`/say` — Send a custom embed" },
      )
      .setFooter({ text: "Slash commands use / • Mod commands use !" });
    message.channel.send({ embeds: [embed] });
  }
});

// ── Slash command handler ──────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) return handleButton(interaction);
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // /say
  if (commandName === "say") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return interaction.reply({ content: "❌ No permission.", ephemeral: true });
    const title = interaction.options.getString("title");
    const text = interaction.options.getString("text");
    const color = parseInt((interaction.options.getString("color") || "5865f2").replace("#", ""), 16);
    const embed = new EmbedBuilder().setTitle(title).setDescription(text).setColor(isNaN(color) ? 0x5865f2 : color);
    await interaction.reply({ content: "✅ Sent!", ephemeral: true });
    await interaction.channel.send({ embeds: [embed] });
  }

  // /giveaway
  else if (commandName === "giveaway") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return interaction.reply({ content: "❌ No permission.", ephemeral: true });
    const prize = interaction.options.getString("prize");
    const minutes = interaction.options.getInteger("minutes");
    const endsAt = Date.now() + minutes * 60 * 1000;
    const embed = new EmbedBuilder()
      .setColor(0xffd700).setTitle("🎉 GIVEAWAY!")
      .setDescription(`**Prize:** ${prize}\n\nReact with 🎉 to enter!\n\n**Ends:** <t:${Math.floor(endsAt / 1000)}:R>`)
      .setTimestamp(endsAt);
    await interaction.reply({ content: "✅ Giveaway started!", ephemeral: true });
    const msg = await interaction.channel.send({ embeds: [embed] });
    await msg.react("🎉");
    giveaways[msg.id] = { prize, endsAt, channelId: interaction.channel.id, ended: false };
  }

  // /rank
  else if (commandName === "rank") {
    const data = getXP(interaction.user.id);
    const needed = data.level * 100;
    const filled = Math.floor((data.xp / needed) * 10);
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2).setTitle(`⭐ ${interaction.user.username}'s Rank`)
      .addFields(
        { name: "Level", value: `${data.level}`, inline: true },
        { name: "XP", value: `${data.xp} / ${needed}`, inline: true },
        { name: "Progress", value: `\`${bar}\`` }
      ).setThumbnail(interaction.user.displayAvatarURL());
    interaction.reply({ embeds: [embed] });
  }

  // /8ball
  else if (commandName === "8ball") {
    const responses = ["Yes!", "No.", "Definitely!", "Absolutely not.", "Maybe...", "Ask again later.", "Without a doubt!", "Don't count on it.", "It is certain.", "Very doubtful."];
    const question = interaction.options.getString("question");
    const answer = responses[Math.floor(Math.random() * responses.length)];
    interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle("🎱 Magic 8-Ball").addFields({ name: "Question", value: question }, { name: "Answer", value: `**${answer}**` })] });
  }

  // /coinflip
  else if (commandName === "coinflip") {
    const result = Math.random() < 0.5 ? "Heads 🪙" : "Tails 🪙";
    interaction.reply({ embeds: [new EmbedBuilder().setColor(0xffd700).setTitle(`Coin Flip: **${result}**`)] });
  }

  // /roll
  else if (commandName === "roll") {
    const sides = interaction.options.getInteger("sides") || 6;
    const result = Math.floor(Math.random() * sides) + 1;
    interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff6b6b).setTitle(`🎲 Rolled a d${sides}: **${result}**`)] });
  }

  // /serverinfo
  else if (commandName === "serverinfo") {
    const g = interaction.guild;
    interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`ℹ️ ${g.name}`).setThumbnail(g.iconURL())
      .addFields(
        { name: "Owner", value: `<@${g.ownerId}>`, inline: true },
        { name: "Members", value: `${g.memberCount}`, inline: true },
        { name: "Channels", value: `${g.channels.cache.size}`, inline: true },
        { name: "Roles", value: `${g.roles.cache.size}`, inline: true },
        { name: "Created", value: `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`, inline: true },
      )] });
  }

  // /userinfo
  else if (commandName === "userinfo") {
    const user = interaction.options.getUser("user") || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);
    interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`ℹ️ ${user.username}`).setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: "ID", value: user.id, inline: true },
        { name: "Joined Server", value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : "N/A", inline: true },
        { name: "Account Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`, inline: true },
        { name: "Roles", value: member ? member.roles.cache.filter(r => r.name !== "@everyone").map(r => `${r}`).join(", ") || "None" : "N/A" },
      )] });
  }

  // /warnings
  else if (commandName === "warnings") {
    const target = interaction.options.getUser("user");
    const list = warnings[interaction.guild.id]?.[target.id] || [];
    interaction.reply({ embeds: [new EmbedBuilder().setColor(0xffa500).setTitle(`⚠️ Warnings for ${target.username}`)
      .setDescription(list.length ? list.map((w, i) => `**${i + 1}.** ${w}`).join("\n") : "No warnings.")] });
  }

  // /configure
  else if (commandName === "configure") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: "❌ Only admins can run /configure.", ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("⚙️ Ticket Panel Setup")
      .setDescription("Click the ticket types you want on your panel, then click **✅ Done** when finished.\n\nThe panel will be posted in this channel.")
      .setFooter({ text: "You can re-run /configure anytime to update" });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cfg_support").setLabel("📩 Support").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("cfg_claims").setLabel("🎁 Claims").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("cfg_sponsorship").setLabel("🤝 Sponsorship").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("cfg_appeals").setLabel("⚖️ Appeals").setStyle(ButtonStyle.Danger),
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cfg_reports").setLabel("🚨 Reports").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("cfg_other").setLabel("💬 Other").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("cfg_done").setLabel("✅ Done — Post Panel").setStyle(ButtonStyle.Success),
    );

    configSessions[interaction.user.id] = { selected: [], channelId: interaction.channel.id, guildId: interaction.guild.id };
    await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
  }
});

// ── Button handler ─────────────────────────────────────────────────
async function handleButton(interaction) {

  // Configure panel selection
  if (interaction.customId.startsWith("cfg_")) {
    const session = configSessions[interaction.user.id];
    if (!session) return interaction.reply({ content: "❌ Run /configure first.", ephemeral: true });

    if (interaction.customId === "cfg_done") {
      if (session.selected.length === 0)
        return interaction.reply({ content: "❌ Select at least one ticket type first!", ephemeral: true });

      await interaction.reply({ content: "⚙️ Building your ticket panel...", ephemeral: true });

      const guild = interaction.guild;
      try {
        // Ensure ticket-logs channel exists
        const staffRole = guild.roles.cache.find(r => r.name === "Staff");
        let ticketLogs = guild.channels.cache.find(c => c.name === "ticket-logs" && c.type === ChannelType.GuildText);
        if (!ticketLogs) {
          ticketLogs = await guild.channels.create({
            name: "ticket-logs",
            type: ChannelType.GuildText,
            permissionOverwrites: [
              { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
              ...(staffRole ? [{ id: staffRole.id, allow: [PermissionsBitField.Flags.ViewChannel] }] : []),
            ],
            reason: "Auto-created by /configure"
          });
        }

        // Build panel buttons
        const buttonMap = {
          support:     { label: "📩 Support",     style: ButtonStyle.Secondary },
          claims:      { label: "🎁 Claims",      style: ButtonStyle.Success },
          sponsorship: { label: "🤝 Sponsorship", style: ButtonStyle.Primary },
          appeals:     { label: "⚖️ Appeals",     style: ButtonStyle.Danger },
          reports:     { label: "🚨 Reports",     style: ButtonStyle.Danger },
          other:       { label: "💬 Other",       style: ButtonStyle.Secondary },
        };

        const selectedBtns = session.selected.map(type =>
          new ButtonBuilder().setCustomId(`open_ticket_${type}`).setLabel(buttonMap[type].label).setStyle(buttonMap[type].style)
        );
        const rows = [];
        for (let i = 0; i < selectedBtns.length; i += 5)
          rows.push(new ActionRowBuilder().addComponents(selectedBtns.slice(i, i + 5)));

        const panelEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🎫 Server Tickets")
          .setDescription("To create a ticket, click the button for the type of support you need.")
          .setTimestamp();

        const panelChannel = await client.channels.fetch(session.channelId);
        await panelChannel.send({ embeds: [panelEmbed], components: rows });

        await interaction.followUp({ content: `✅ Ticket panel posted! Ticket logs will appear in ${ticketLogs}.`, ephemeral: true });
        delete configSessions[interaction.user.id];
      } catch (err) {
        console.error("Configure error:", err);
        await interaction.followUp({ content: `❌ Failed: ${err.message}`, ephemeral: true });
      }
      return;
    }

    // Toggle selection
    const type = interaction.customId.replace("cfg_", "");
    const idx = session.selected.indexOf(type);
    if (idx === -1) {
      session.selected.push(type);
      await interaction.reply({ content: `✅ Added **${type}**. Current: ${session.selected.join(", ")}`, ephemeral: true });
    } else {
      session.selected.splice(idx, 1);
      await interaction.reply({ content: `❌ Removed **${type}**. Current: ${session.selected.join(", ") || "none"}`, ephemeral: true });
    }
    return;
  }

  // Open ticket from panel
  if (interaction.customId.startsWith("open_ticket_")) {
    const type = interaction.customId.replace("open_ticket_", "");
    const guild = interaction.guild;
    const member = interaction.member;
    const existing = guild.channels.cache.find(c => c.name === `ticket-${member.user.username.toLowerCase()}-${type}`);
    if (existing) return interaction.reply({ content: `❌ You already have a ${type} ticket: ${existing}`, ephemeral: true });

    const staffRole = guild.roles.cache.find(r => r.name === "Staff");
    const channel = await guild.channels.create({
      name: `ticket-${member.user.username.toLowerCase()}-${type}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ...(staffRole ? [{ id: staffRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : []),
      ],
    });

    const closeBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 Close Ticket").setStyle(ButtonStyle.Danger)
    );
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🎫 ${type.charAt(0).toUpperCase() + type.slice(1)} Ticket`)
      .setDescription(`Hello ${member}! A staff member will be with you shortly.\n\nPlease describe your issue and click **Close Ticket** when resolved.`)
      .setTimestamp();

    await channel.send({ embeds: [embed], components: [closeBtn] });
    await interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
    return;
  }

  // Close ticket
  if (interaction.customId === "close_ticket") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels) &&
        !interaction.channel.name.includes(interaction.user.username.toLowerCase()))
      return interaction.reply({ content: "❌ No permission.", ephemeral: true });
    await interaction.reply({ content: "🔒 Closing ticket in 5 seconds..." });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }
}

// ── Giveaway end ───────────────────────────────────────────────────
async function endGiveaway(msgId, gw) {
  try {
    const channel = await client.channels.fetch(gw.channelId);
    const msg = await channel.messages.fetch(msgId);
    const reaction = msg.reactions.cache.get("🎉");
    const users = await reaction.users.fetch();
    const entries = users.filter(u => !u.bot).map(u => u);
    if (entries.length === 0) { channel.send(`🎉 Giveaway for **${gw.prize}** ended — no valid entries!`); return; }
    const winner = entries[Math.floor(Math.random() * entries.length)];
    const embed = new EmbedBuilder()
      .setColor(0xffd700).setTitle("🎉 Giveaway Ended!")
      .setDescription(`**Prize:** ${gw.prize}\n**Winner:** ${winner}\n\nCongratulations!`)
      .setTimestamp();
    channel.send({ content: `🎊 Congratulations ${winner}!`, embeds: [embed] });
  } catch (e) { console.error("Giveaway end error:", e); }
}

// ── Mod embed helper ───────────────────────────────────────────────
function modEmbed(title, target, mod, reason, color) {
  return new EmbedBuilder().setColor(color).setTitle(title)
    .addFields(
      { name: "User", value: `${target.user.tag}`, inline: true },
      { name: "By", value: `${mod.tag}`, inline: true },
      { name: "Reason", value: reason }
    ).setTimestamp();
}

// ── Keep-alive ─────────────────────────────────────────────────────
http.createServer((req, res) => res.end("alive")).listen(3000, () => {
  console.log("🌐 Keep-alive server on port 3000");
});

client.login(process.env.TOKEN);

# Check your setup

**AURA: Check my setup** finds R on your computer and asks R which packages are installed. It does not change anything.

You get a list. Every line says **OK**, **MISSING**, **NEEDS UPDATE**, **BROKEN**, **CHECK**, or **NOTE** in words, so you do not need to tell colors or icons apart.

If anything is missing, choose **Install what is missing** at the top of the list. The extension:

1. sets the download site for you, so R never shows the long list of countries and cities,
2. installs into your personal R library, so R never asks about a personal library,
3. installs the course package **v2v** from GitHub for MC 451 and MC 501, the same way the hub's install page does,
4. adds the R extension for VS Code (by REditorSupport) if it is missing,
5. then checks again, by looking in your R library. It only says a package installed if R can find it there.

The install can take several minutes. You can watch R's own messages in the **Output** panel.

This step gets its tick once every line your course needs says **OK**.

## Before you open R in VS Code

The first time R opens, VS Code asks to install a helper called **sess**. Click **Install bundled sess**. You must say yes, or R will not connect. Missed it? Click the bell in the bottom-right corner to find it. If it is not there, run **AURA: Install what is missing**.

**For MC 427:** when everything says OK, choose **Run mc427-setup-check.R in an R terminal**. The last line should read `SETUP OK: R and the course packages are working.` That is the line your Tools Stack Setup screenshot needs.

**For MC 451 and MC 501:** the list includes the lines from `v2v::setup()`, the course package's own check.

**Asking for help?** Choose **Copy this report** and paste it into your message. It answers the first questions anyone would ask.

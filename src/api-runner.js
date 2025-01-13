  require('dotenv').config();
  const api = require('./services/api.ts');
  const fs = require('fs/promises');

  async function main() {
      try {
          const allApps = await api.fetchAppDataFromDB();
          if (!allApps || allApps.length === 0) {
               console.error('No app ids found.');
               return;
           }
          for (const app of allApps){
              const appDetails =  await api.fetchAppDetails(app);
              const appId = appDetails.appId;
              const appName = appDetails.title;
              const screenshotPaths = [];
              for (let i = 0; i < appDetails.screenshots.length; i++) {
                  const url = appDetails.screenshots[i];
                  const screenshotPath = await api.downloadImage(url, appId, appName, `screen_${i}`);
                    if (screenshotPath) {
                       screenshotPaths.push(screenshotPath);
                    }
              }
               for (let i = 0; i < appDetails.ipadScreenshots.length; i++) {
                  const url = appDetails.ipadScreenshots[i];
                 const screenshotPath = await api.downloadImage(url, appId, appName, `ipad_screen_${i}`);
                 if (screenshotPath) {
                      screenshotPaths.push(screenshotPath);
                 }
               }

              if(screenshotPaths.length === 0){
                  console.log(`no screenshots found for app ${appName}`);
              }
               const colorPalette = await api.extractColorPalette(screenshotPaths[0]);
              if (!colorPalette) {
                  console.log(`no color palette found for app ${appName}`)
              }
              const mdContent = await api.generateMarkdownWithGemini(appDetails, screenshotPaths, colorPalette);

             if(mdContent){
                const mdPath = `/public/config/${appId}_${appName.replace(/ /g, '_')}.md`;
                 const path = require('path')
                 const fs = require('fs/promises')
                 const dir = path.join(process.cwd(), 'public', 'config')
                  await fs.mkdir(dir, {recursive: true})
                  await fs.writeFile(path.join(process.cwd(), mdPath), mdContent)
              }
           }
         console.log("Markdown files generated for all apps");
        } catch (error) {
              console.error("Error generating markdown:", error);
        }
    }
  main()

import axios from 'axios';
import { ColorThief } from 'colorthief';
import sharp from 'sharp';
import { AppData } from '../types';
const store = require('app-store-scraper');

const GOOGLE_API_KEY = process.env.REACT_APP_GOOGLE_API_KEY;

interface GeminiResponse {
  text(): Promise<string>;
}

async function fetchAppDataFromDB(): Promise<AppData[]> {
    try {
        const response = await axios.post('/.netlify/functions/get_apps_from_db')
        if (response.data && response.data.result) {
            return response.data.result as AppData[];
        } else {
            console.error("Data not found in response from /get_apps_from_db")
            return [];
        }
    } catch (error) {
      console.error('Error fetching app data from database:', error);
      return [];
    }
  }

async function fetchAppDetails(appId: number): Promise<AppData> {
  try {
    const appDetails = await store.app({id: appId})
    return appDetails;
  } catch (error) {
    console.error(`Error fetching app details for id ${appId}:`, error);
    throw error;
  }
}
async function downloadImage(url: string, appId: string, appName: string, imageType: string) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const image = sharp(response.data);
        const imageBuffer = await image.toBuffer();
        const imagePath = `/screenshots/${appId}/${appName.replace(/ /g, '_')}_${imageType}.png`; // using public path

        await fetch(imagePath, {
          method: 'PUT',
          body: imageBuffer
        });
        return imagePath;

      } catch (error) {
          console.error(`Error downloading image ${url}:`, error);
          return null;
      }
  }


async function extractColorPalette(imagePath: string) {
    try {
        const response = await fetch(imagePath);
        if(!response.ok) {
            console.error(`Error fetching image for color extraction: ${response.status} ${response.statusText}`)
            return null;
        }

        const buffer = await response.arrayBuffer();
      const colorThief = new ColorThief();
      const palette = await colorThief.getPaletteFromBuffer(Buffer.from(buffer), 5);
      return palette.map(rgb => `#${rgb.map(c => c.toString(16).padStart(2, '0')).join('')}`);
    } catch (error) {
      console.error(`Error extracting colors from ${imagePath}:`, error);
      return null;
    }
}


async function generateMarkdownWithGemini(appData: AppData, screenshotPaths: string[], colorPalette: string[] | null) {
    if (!GOOGLE_API_KEY) {
        console.error('Gemini API key not found. Check your .env.local file');
        return null;
    }

    const { title: appName, description: appDescription, genres, appId } = appData;
    const images = [];

     for (const screenshotPath of screenshotPaths){
        if (screenshotPath){
            try{
                const response = await fetch(screenshotPath);
                if(!response.ok){
                   console.error(`Error reading image: ${response.status} ${response.statusText}`);
                   continue;
                }

               const imageBuffer = await response.arrayBuffer()

                images.push( {
                    inlineData: {
                        mimeType: 'image/png', // or 'image/jpeg'
                        data: Buffer.from(imageBuffer).toString('base64')
                    }
                })
            }
            catch (e){
                console.log(`error reading image path ${screenshotPath}`, e);
            }
        }
    }


    const basicInfoSection = `
    ---
    title: ${appName}
    description: ${appDescription}
    genres: ${JSON.stringify(genres)}
    appId: ${appId}
    ---

    # ${appName}

    `;

    const prompt = `
        Analyze the provided app screenshots and color palette to generate comprehensive markdown content:
        
        Color Palette: ${colorPalette?.join(', ')}
        Screenshots paths: ${screenshotPaths.join(',')}
        
        The markdown should include:
        
            - A section called \`Color Style Analysis Procedure\` explaining how the color palette was generated.
            - A \`Color Report\` with detailed analysis of the color palette usage, and overall impression, connecting to the game genre.
            - A \`Color Style Tailwind Code\` section showing the implementation of the colors on Tailwind CSS.
            - A \`Color Style Other Code\` section showing the implementation of the colors on CSS vars.
            - Three example app ideas applying this style, showing a generated example image for each one and with its specific description.
              - The images should be generated using the app color style

            The response needs to be a complete markdown format and do not include any comments.
        `;
    try {
        const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
        const geminiResponse = await model.generateContent({
            contents: [{
                parts: [{text:prompt}, ...images]
              }]
            });
       return basicInfoSection + geminiResponse.response.text();
    } catch (error) {
        console.error("Error generating markdown using Gemini API:", error);
        return null;
    }
}


const api = {
  fetchAppDataFromDB,
    downloadImage,
    extractColorPalette,
  fetchAppDetails,
  generateMarkdownWithGemini,
};

export default api;

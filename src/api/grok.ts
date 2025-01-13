import axios from 'axios';
import { ColorThief } from 'colorthief';
import sharp from 'sharp';
import { AppData } from '../types';
const store = require('app-store-scraper');
import * as path from 'path';
import * as fs from 'fs/promises';
import { createOpenAI, OpenAI } from '@ai-sdk/openai';

import type { LanguageModelV1 } from 'ai';

interface ModelInfo {
    name: string;
    label: string;
    provider: string;
    maxTokenAllowed: number;
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;


const staticModels: ModelInfo[] = [
    { name: 'llama-3.1-8b-instant', label: 'Llama 3.1 8b (Groq)', provider: 'Groq', maxTokenAllowed: 8000 },
    { name: 'llama-3.2-11b-vision-preview', label: 'Llama 3.2 11b (Groq)', provider: 'Groq', maxTokenAllowed: 8000 },
    { name: 'llama-3.2-90b-vision-preview', label: 'Llama 3.2 90b (Groq)', provider: 'Groq', maxTokenAllowed: 8000 },
    { name: 'llama-3.2-3b-preview', label: 'Llama 3.2 3b (Groq)', provider: 'Groq', maxTokenAllowed: 8000 },
    { name: 'llama-3.2-1b-preview', label: 'Llama 3.2 1b (Groq)', provider: 'Groq', maxTokenAllowed: 8000 },
    { name: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70b (Groq)', provider: 'Groq', maxTokenAllowed: 8000 },
  ];


const defaultModel = staticModels.find(model => model.name === 'llama-3.1-8b-instant') || staticModels[0]!;


let modelInstance: LanguageModelV1;
interface GeminiResponse {
    text(): Promise<string>;
}

async function fetchAppDataFromDB(): Promise<AppData[]> {
    try {
        const response = await axios.get(process.env.DATABASE_API_URL as string)
        if (response.data && response.data.result) {
            return response.data.result as AppData[];
        } else {
            console.error("Data not found in response from the provided DATABASE_API_URL")
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

         const imagePath = path.join(process.cwd(), 'screenshots', appId, `${appName.replace(/ /g, '_')}_${imageType}.png`);
        await fs.mkdir(path.dirname(imagePath), {recursive: true});
        await fs.writeFile(imagePath, imageBuffer)

        return imagePath;

      } catch (error) {
          console.error(`Error downloading image ${url}:`, error);
          return null;
      }
  }

async function extractColorPalette(imagePath: string) {
try {
    const buffer = await fs.readFile(imagePath);
     const colorThief = new ColorThief();
  const palette = await colorThief.getPaletteFromBuffer(buffer, 5);
  return palette.map(rgb => `#${rgb.map(c => c.toString(16).padStart(2, '0')).join('')}`);
} catch (error) {
  console.error(`Error extracting colors from ${imagePath}:`, error);
  return null;
}
}


async function generateMarkdownWithGemini(appData: AppData, screenshotPaths: string[], colorPalette: string[] | null): Promise<string | null> {
    if (!GROQ_API_KEY) {
        console.error('GROQ API key not found. Check your .env.local file');
        return null;
    }

    if (!modelInstance) {
        const openai = createOpenAI({
            baseURL: 'https://api.groq.com/openai/v1',
            apiKey: GROQ_API_KEY,
        });

        modelInstance = openai(defaultModel.name) as LanguageModelV1;
    }

    const { title: appName, description: appDescription, genres, appId } = appData;
    const images = [];

     for (const screenshotPath of screenshotPaths){
        if (screenshotPath){
            try{
                const imageBuffer = await fs.readFile(screenshotPath);
                images.push( {
                    inlineData: {
                        mimeType: 'image/png',
                        data: imageBuffer.toString('base64')
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
      const geminiResponse = await modelInstance.generateContent({
           contents: [{
               parts: [{text:prompt}, ...images]
             }]
         });
         return basicInfoSection + (geminiResponse as any).text();
     } catch (error) {
         console.error("Error generating markdown using Groq API:", error);
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

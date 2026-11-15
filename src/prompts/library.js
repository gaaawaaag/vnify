import {PROMPT_LIBRARY} from './library.generated.js';
import {renderPromptFrom,promptRecipeFrom} from './format.js';

// lang: the work's language; a fragment's variant for it replaces the fragment when the library has one.
export const renderPrompt=(id,values,lang)=>renderPromptFrom(PROMPT_LIBRARY,id,values,lang);
export const promptRecipe=(name,lang)=>promptRecipeFrom(PROMPT_LIBRARY,name,lang);

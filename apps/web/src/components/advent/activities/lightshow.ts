import { defineActivity } from './activity';
import { parseLightshow } from '@/lib/lightshow';
import { LightshowActivity } from './lightshow-component';

export const lightshowActivity = defineActivity({ id: 'lightshow', parse: parseLightshow, Component: LightshowActivity });

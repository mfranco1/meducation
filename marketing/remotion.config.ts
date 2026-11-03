import { Config } from '@remotion/cli/config';
import { adWebpack } from './webpack';

// Used by Remotion Studio only; the CLI bundles with the same override.
if (!process.env.AD) throw new Error('Choose a production: AD=ads/<id> npm --prefix marketing run studio');
Config.setPublicDir('public');
Config.overrideWebpackConfig(adWebpack(process.cwd(), process.env.AD));

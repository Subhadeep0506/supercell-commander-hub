// Browser entry. Mirrors index.js (the Metro entry) so both targets mount the
// same App through AppRegistry -- that is also what makes react-native-web
// inject its base stylesheet.
import { AppRegistry } from 'react-native';
import App from '../App';
import { name as appName } from '../app.json';

const rootTag = document.getElementById('root');
if (!rootTag) throw new Error('index.html is missing <div id="root">');

AppRegistry.registerComponent(appName, () => App);
// react-native's types declare RootTag as a symbol, because on native it is
// one. react-native-web -- what this import actually resolves to at runtime --
// expects the host DOM element instead.
AppRegistry.runApplication(appName, { initialProps: {}, rootTag: rootTag as never });

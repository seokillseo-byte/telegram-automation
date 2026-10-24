import {createContext,useContext} from 'react';
import {DEFAULT_PREFERENCES,formatAppTime} from '../../../../packages/shared/src/app-state';
export const PreferencesContext=createContext(DEFAULT_PREFERENCES);
export function useDateFormatter(){const settings=useContext(PreferencesContext);return (value:string|null)=>value?formatAppTime(value,settings.timeZone):'Không khả dụng';}

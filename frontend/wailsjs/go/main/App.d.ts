// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
import {main} from '../models';

export function AddDownload(arg1:string,arg2:string,arg3:number,arg4:number):Promise<void>;

export function AllDownloads():Promise<Array<main.Download>>;

export function CancelDownload(arg1:number):Promise<void>;

export function GetDefaultDownloadPath():Promise<string>;

export function Greet(arg1:string):Promise<string>;

export function PauseDownload(arg1:number):Promise<void>;

export function ResumeDownload(arg1:number):Promise<void>;

export function ShowDirectoryDialog(arg1:string):Promise<string>;

export function ShowFileDialog(arg1:string,arg2:string):Promise<string>;

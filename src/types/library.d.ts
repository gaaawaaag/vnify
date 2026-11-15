// The bookshelf on disk behind /api/library (src/server/library.mjs): one folder per book key.

// meta.json; files lists the package tree under package/.
export interface BookMeta {
  bookId:string;title:string;author:string|null;complete:boolean;addedAt:number;updatedAt:number;
  cover:{id:string;type:CoverType;at:number}|null;files:string[];
  // The original book's cover among the package files (EPUB covers kept in extra.json); undefined before it was looked up.
  originalCover?:string|null;
  // The work's language (@book lang) and which way its pictures face (null without pictures); undefined before it was looked up.
  lang?:'zh'|'zh-Hant'|'en'|'ja';orientation?:'landscape'|'portrait'|null;
}
export type CoverType='image/webp'|'image/jpeg'|'image/png';
// Reading data sits apart from the content, under .reading/<key>/, one file per device in each folder; a device only
// writes its own files. progress/<device>.json: savedAt is set by the server clock and tells one device's save from
// another's; the shelf shows the latest save, with the furthest place any device reached.
export interface Progress {
  index:number;furthest?:number;count?:number;title?:string;complete?:boolean;chapter?:string;
  documentScroll?:Record<string,number>;savedAt?:number;device?:string;
  // The book version (meta.updatedAt) the position belongs to; the shelf refuses positions in a replaced text.
  version?:number;
}
/* sessions/<device>.json: one stretch of reading, on the device's clock. active counts only time with input no more
 * than a few minutes apart; days splits it by the reader's local date (YYYY-MM-DD), so the parts add up to active.
 * from/to/furthest are unit indexes in the book version the session was read in. */
export interface ReadingSession {
  id:string;start:number;end:number;tz:number;active:number;days:Record<string,number>;
  from:number;to:number;furthest:number;version?:number;
}
export interface DeviceSessions {device:string;sessions:ReadingSession[]}
// GET /api/library/_days: reading time per local date over the whole shelf, removed books included.
export interface ReadingDays {[date:string]:{total:number;books:Record<string,number>}}
// One row of GET /api/library.
export interface BookListing extends Omit<BookMeta,'files'> {
  key:string;progress:Pick<Progress,'index'|'count'|'furthest'|'chapter'|'savedAt'>|null;
}
// POST /api/library/<key>/commit: the package's text files and the images already uploaded; the shelf reads title,
// author and completion from them.
export interface CommitRequest {manifest:string;story:string;extra:string|null;assets:string[]}

// @ts-check
/** @import {ReadingSession} from '../types/library.js' */

/* Reading time for the shelf's statistics. Time counts between two inputs (turning, scrolling, keys, auto-play) no
 * more than IDLE apart, and each counted stretch is credited to the local date it fell on, so a session that runs past
 * midnight is split across both days. A gap longer than RESUME, or another book, starts a new session; a session with
 * less than MIN_ACTIVE of reading is not kept. */
export const IDLE=3*60_000,RESUME=30*60_000,MIN_ACTIVE=10_000;

/** The local date of a moment as YYYY-MM-DD. @param {number} time */
export function localDay(time) {
  const date=new Date(time),pad=(/** @type {number} */ n)=>String(n).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}
/** Adds the stretch from a to b to days, cut at each local midnight. @param {Record<string,number>} days @param {number} a @param {number} b */
export function addSpan(days,a,b) {
  while(a<b) {
    const date=new Date(a),midnight=new Date(date.getFullYear(),date.getMonth(),date.getDate()+1).getTime();
    const cut=Math.min(b,midnight),day=localDay(a);
    days[day]=(days[day]??0)+(cut-a);
    a=cut;
  }
}

/**
 * @param {{now?:()=>number,newId?:()=>string}} [options]
 */
export function createReadingClock({now=Date.now,newId=()=>`s-${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`}={}) {
  /** @type {{key:string,session:ReadingSession,changed:boolean}|null} */
  let current=null;
  // The last input that time can count from; null after a pause, so the time away is not counted.
  /** @type {number|null} */
  let last=null;
  let lastSeen=0;
  /** @type {{key:string,session:ReadingSession}[]} */
  let finished=[];
  const keep=(/** @type {ReadingSession} */ session)=>session.active>=MIN_ACTIVE;
  function finish() {
    if(current&&current.changed&&keep(current.session))finished.push({key:current.key,session:{...current.session,days:{...current.session.days}}});
    current=null;last=null;
  }
  return {
    /** An input while the book is open on the reading screen. @param {string} key @param {number} index @param {number} [version] */
    activity(key,index,version) {
      const time=now();
      if(current&&(current.key!==key||current.session.version!==version||time-lastSeen>RESUME))finish();
      if(!current) {
        current={key,changed:false,session:{id:newId(),start:time,end:time,tz:-new Date(time).getTimezoneOffset(),active:0,days:{},
          from:index,to:index,furthest:index,...(version!==undefined?{version}:{})}};
      }
      const session=current.session;
      if(last!==null&&time-last<=IDLE&&time>last) {
        addSpan(session.days,last,time);
        session.active+=time-last;session.end=time;
      }
      session.to=index;session.furthest=Math.max(session.furthest,index);
      current.changed=true;last=time;lastSeen=time;
    },
    // The page was hidden or the reader closed: time up to now counts if the last input was recent, then stops.
    pause() {
      if(!current||last===null)return;
      const time=now();
      if(time-last<=IDLE&&time>last){addSpan(current.session.days,last,time);current.session.active+=time-last;current.session.end=time;current.changed=true;}
      last=null;lastSeen=time;
    },
    // Ends the open session, e.g. on returning to the shelf.
    finish,
    /** Sessions with unsaved reading, to send now; they are marked saved. @returns {{key:string,session:ReadingSession}[]} */
    take() {
      const out=finished;finished=[];
      if(current?.changed&&keep(current.session)) {
        out.push({key:current.key,session:{...current.session,days:{...current.session.days}}});
        current.changed=false;
      }
      return out;
    },
    /** Puts back sessions that failed to save, unless a newer copy of the same session is waiting. @param {{key:string,session:ReadingSession}[]} items */
    restore(items) {
      for(const item of items) {
        if(current?.session.id===item.session.id){current.changed=true;continue;}
        if(!finished.some(other=>other.session.id===item.session.id))finished.push(item);
      }
    },
  };
}

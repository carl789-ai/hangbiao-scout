// Shared numeric rules for the task table and its offline export.
export const FILTER_RANGES = [
 {key:'totalResults',label:'搜索结果数',min:'minResults',max:'maxResults',step:'1'},
 {key:'averagePrice',label:'均价',min:'minPrice',max:'maxPrice',step:'0.01'},
 {key:'lowReviewItemsCount',label:'蓝海值',min:'minBlue',max:'maxBlue',step:'1'},
 {key:'homeBlueSeaRatio',label:'蓝海比率',min:'minRatio',max:'maxRatio',step:'0.1',scale:100,limit:100,unit:'%'},
 {key:'averageReviews',label:'平均评论',min:'minReviews',max:'maxReviews',step:'1'},
 {key:'averageRating',label:'平均评分',min:'minRating',max:'maxRating',step:'0.1',limit:5},
 {key:'totalSales',label:'购买标签合计',min:'minSales',max:'maxSales',step:'1'},
 {key:'overall_score',label:'AI 评分',min:'minScore',max:'maxScore',step:'1',limit:100}
];
export function filterErrors(options={}){
 const errors=[];
 for(const range of FILTER_RANGES){
  const lo=options[range.min],hi=options[range.max],hasLo=lo!==''&&lo!=null,hasHi=hi!==''&&hi!=null;
  for(const value of [hasLo?lo:null,hasHi?hi:null])if(value!==null&&(!Number.isFinite(Number(value))||Number(value)<0||(range.limit!=null&&Number(value)>range.limit))){errors.push(range.label+'超出有效范围');break;}
  if(hasLo&&hasHi&&Number(lo)>Number(hi))errors.push(range.label+'的最小值不能大于最大值');
 }
 return errors;
}
export function matchesNumericFilters(item,options={},template='keyword'){
 for(const range of FILTER_RANGES){
  const lo=options[range.min],hi=options[range.max],hasLo=lo!==''&&lo!=null,hasHi=hi!==''&&hi!=null;
  if(!hasLo&&!hasHi)continue;
  const record=item.analysis?.[template],raw=range.key==='overall_score'?(record?.state==='done'?(record.result?.overall_score??record.result?.rating):null):item.data?.[range.key];
  if(typeof raw!=='number'||!Number.isFinite(raw))return false;
  const value=raw*(range.scale||1);
  if((hasLo&&value<Number(lo))||(hasHi&&value>Number(hi)))return false;
 }
 return true;
}
export function compareItems(a,b,{sort='keyword',sortDirection,template='keyword'}={}){
 if(sort==='keyword')return (sortDirection==='desc'?-1:1)*a.keyword.localeCompare(b.keyword);
 const value=i=>sort==='overall_score'?(i.analysis?.[template]?.state==='done'?(i.analysis[template].result?.overall_score??i.analysis[template].result?.rating):null):i.data?.[sort];
 const av=value(a),bv=value(b),ak=typeof av==='number'&&Number.isFinite(av),bk=typeof bv==='number'&&Number.isFinite(bv);
 if(ak!==bk)return ak?-1:1;
 return (ak?(sortDirection==='asc'?1:-1)*(av-bv):0)||a.keyword.localeCompare(b.keyword);
}

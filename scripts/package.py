from pathlib import Path
import zipfile,json,hashlib
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version'];dist=root/'dist';dist.mkdir(exist_ok=True)
common=['extension','docs','agent','README.md','LICENSE','CHANGELOG.md','AGENTS.md','DESIGN.md']
files=[]
for name in common:
 path=root/name;files.extend([path] if path.is_file() else [p for p in path.rglob('*') if p.is_file() and not p.name.startswith('.')])
# Only explicitly listed distributable sources. No user state, old vendor bundle, credentials or test dependencies.
for platform in ['Mac','Windows','Source']:
 name=f'Hangbiao-Scout-{version}-{platform}';extra=[]
 if platform=='Source':
  for n in ['tests','scripts','.github','package.json','package-lock.json','.gitignore']:
   p=root/n;extra.extend([p] if p.is_file() else [q for q in p.rglob('*') if q.is_file()])
 with zipfile.ZipFile(dist/(name+'.zip'),'w',zipfile.ZIP_DEFLATED) as z:
  def add(path,data):
   info=zipfile.ZipInfo(path,date_time=(2026,10,27,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=0o100644<<16;z.writestr(info,data)
  for p in sorted(set(files+extra)):add(str(Path(name)/p.relative_to(root)),p.read_bytes())
  add(name+'/先读我.txt',f'航标选品 {version} / {platform}\n请先解压，再在Chrome扩展页开启开发者模式并加载extension文件夹。\n普通用户无需Node/Python，不能将普通ZIP直接拖入安装。\n安装与使用教程在docs目录。此版本为beta，验收范围见docs/验收记录.md。\n')
checks={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(dist.glob(f'Hangbiao-Scout-{version}-*.zip'))}
(dist/'SHA256SUMS.txt').write_text(''.join(f'{v}  {k}\n' for k,v in checks.items()))
print(json.dumps(checks,indent=2))

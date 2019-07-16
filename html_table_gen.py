import pandas as pd
import sys

data = pd.read_csv(sys.argv[1], sep=", \t", header=None, engine='python', dtype='str')

strTable = ""
for num in range(0,data.shape[0]-1):
 strRW = "\n<tr>\n\t<td>"+data[0][num]+ "</td>\n\t<td>"+data[1][num]+"</td>\n\t<td>"+data[2][num]+"</td>\n</tr>"
 strTable = strTable+strRW
 
#hs = open(sys.argv[1], 'w')
#hs.write(strTable)
 
print(strTable)

